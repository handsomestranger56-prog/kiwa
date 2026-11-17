import { useEffect, useState } from 'react';

import type { AiCheck, AiExplanation } from '@/core/quiz/ai-feedback';
import type { Answer } from '@/core/quiz/answers';
import { hasPassed, summarize } from '@/core/quiz/grading';
import {
  type LocatedAssessment,
  type SessionState,
  createSession,
  findAssessment,
  goTo,
  markChecked,
  sessionQuestions,
  setAnswer,
} from '@/core/quiz/session';
import type { LibraryDocument, Question } from '@/core/schema';
import type { Attempt } from '@/data/attempts-repository';
import { useData } from '@/data/provider';

import { applyAttemptCompletion, scheduleReviews } from './completion';

type Loaded = { document: LibraryDocument; located: LocatedAssessment; attempt: Attempt; questions: Question[] };

export type Player =
  | { status: 'loading' | 'missing' | 'empty' }
  | {
      status: 'ready';
      document: LibraryDocument;
      located: LocatedAssessment;
      attempt: Attempt;
      questions: Question[];
      session: SessionState;
      /** True when the most recent answer could not be written to the device. */
      saveFailed: boolean;
      answer: (questionId: string, answer: Answer) => void;
      /** Saves AI feedback for a question, and the answer it implies when there is one. */
      saveAi: (questionId: string, changes: { check?: AiCheck; explanation?: AiExplanation; answer?: Answer }) => void;
      check: (questionId: string) => void;
      move: (index: number) => void;
      /** Grades and closes the attempt. Resolves to its id. */
      finish: () => Promise<string>;
    };

/**
 * Runs one attempt at an assessment. An unfinished attempt is picked up where it stopped,
 * and every change is saved so closing the app loses nothing.
 */
export function usePlayer(itemId: string, assessmentId: string): Player {
  const data = useData();
  const [loaded, setLoaded] = useState<Loaded | 'missing' | 'empty' | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<Loaded | 'missing' | 'empty'> => {
      const document = await data.library.getDocument(itemId);
      const located = document ? findAssessment(document, assessmentId) : null;
      if (!document || !located) return 'missing';
      if (located.assessment.questions.length === 0) return 'empty';

      let attempt = await data.attempts.findOpen(itemId, assessmentId);
      // An attempt whose questions were all edited away cannot be continued.
      if (attempt && sessionQuestions(located.assessment, attempt.state).length === 0) attempt = null;
      attempt ??= await data.attempts.start({
        itemId,
        lessonId: located.lessonId,
        assessmentId,
        mode: located.assessment.mode,
        state: createSession(located.assessment),
      });
      return { document, located, attempt, questions: sessionQuestions(located.assessment, attempt.state) };
    };

    load()
      .then((result) => {
        if (!active) return;
        setLoaded(result);
        if (typeof result === 'object') {
          const ids = result.questions.map((question) => question.id);
          setSession(goTo({ ...result.attempt.state, questionIds: ids }, result.attempt.state.index));
        }
      })
      .catch(() => {
        if (active) setLoaded('missing');
      });

    return () => {
      active = false;
    };
  }, [data, itemId, assessmentId]);

  if (loaded === null) return { status: 'loading' };
  if (typeof loaded === 'string') return { status: loaded };
  if (!session) return { status: 'loading' };

  const { document, located, attempt, questions } = loaded;

  const update = (next: SessionState) => {
    if (next === session) return;
    setSession(next);
    data.attempts
      .save(attempt.id, next)
      .then(() => setSaveFailed(false))
      .catch(() => setSaveFailed(true));
  };

  return {
    status: 'ready',
    document,
    located,
    attempt,
    questions,
    session,
    saveFailed,
    answer: (questionId, answer) => update(setAnswer(session, questionId, answer)),
    check: (questionId) => update(markChecked(session, questionId)),
    saveAi: (questionId, changes) =>
      update({
        ...session,
        answers: changes.answer ? { ...session.answers, [questionId]: changes.answer } : session.answers,
        ai: changes.check ? { ...session.ai, [questionId]: changes.check } : session.ai,
        explanations: changes.explanation ? { ...session.explanations, [questionId]: changes.explanation } : session.explanations,
      }),
    move: (index) => update(goTo(session, index)),
    finish: async () => {
      const summary = summarize(questions, session.answers, session.ai ?? {});
      const passed = hasPassed(located.assessment.mode, located.assessment.passMark, summary);
      await data.attempts.finish(attempt.id, session, { earned: summary.earned, total: summary.total, passed });
      await applyAttemptCompletion(data, document, located, passed);
      await scheduleReviews(data, document.id, questions, session, summary.results).catch(() => {});
      return attempt.id;
    },
  };
}
