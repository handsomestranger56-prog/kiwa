/**
 * Content bundled with the app so a fresh install is never empty.
 * Written as plain input objects and validated on load, exactly like an imported file.
 */

export const sampleCourseInput = {
  format: 'course/1',
  id: 'sample-learning',
  title: 'How to study so it sticks',
  description:
    'Three short lessons on the techniques with the strongest evidence behind them: recalling from memory, spacing your reviews and mixing topics.',
  language: 'en',
  level: 'beginner',
  tags: ['study skills', 'memory'],
  lessons: [
    {
      id: 'recall',
      title: 'Recall beats rereading',
      summary: 'Why testing yourself teaches more than reading the page again.',
      minutes: 4,
      blocks: [
        {
          type: 'text',
          markdown:
            'Rereading feels productive because the text becomes familiar. Familiar is not the same as remembered. When the page is closed, most of it is gone.\n\nPulling an answer out of memory is harder, and that effort is what strengthens the memory. This is called **retrieval practice**.',
        },
        {
          type: 'callout',
          tone: 'tip',
          markdown:
            'After each section, close the book and write down everything you can remember. Then check what you missed.',
        },
        {
          type: 'text',
          markdown:
            'A wrong answer is useful too. Getting something wrong and then seeing the correction makes the correct answer easier to recall later, as long as you do check.',
        },
      ],
      assessments: [
        {
          id: 'recall-practice',
          mode: 'practice',
          questions: [
            {
              id: 'recall-q1',
              type: 'single_choice',
              prompt: 'You have 20 minutes before a test. Which use of the time helps most?',
              options: [
                'Reread your notes twice',
                'Highlight the key sentences',
                'Close your notes and write what you remember, then check',
              ],
              answer: 2,
              explanation:
                'Writing from memory is retrieval practice. Rereading and highlighting only make the material look familiar.',
            },
            {
              id: 'recall-q2',
              type: 'true_false',
              prompt: 'Getting a practice question wrong harms learning even if you check the answer afterwards.',
              answer: false,
              explanation: 'An error followed by the correction tends to improve later recall.',
            },
            {
              id: 'recall-q3',
              type: 'short_answer',
              prompt: 'What is the name for learning by pulling information out of memory?',
              accepted: ['retrieval practice', 'retrieval', 'active recall', 'the testing effect'],
              explanation: 'It is called retrieval practice, also known as active recall or the testing effect.',
            },
          ],
        },
      ],
    },
    {
      id: 'spacing',
      title: 'Space it out',
      summary: 'Why five short sessions beat one long one.',
      minutes: 4,
      blocks: [
        {
          type: 'text',
          markdown:
            'Memories fade quickly at first and more slowly later. Reviewing just as something starts to fade resets the curve and makes the next fade slower.\n\nThat is why the gaps between reviews can grow: one day, then three, then a week, then a month.',
        },
        {
          type: 'callout',
          tone: 'warning',
          markdown:
            'Cramming works for tomorrow and fails for next month. If you need the knowledge later, spread the same total time over several days.',
        },
      ],
      assessments: [
        {
          id: 'spacing-practice',
          mode: 'practice',
          questions: [
            {
              id: 'spacing-q1',
              type: 'multiple_choice',
              prompt: 'Which of these are true of spaced review?',
              options: [
                'The gaps between reviews can grow over time',
                'It needs more total study time than cramming',
                'It works best when a review feels slightly difficult',
                'It only helps with vocabulary',
              ],
              answers: [0, 2],
              explanation:
                'Spacing uses the same total time more effectively, and a little difficulty at review time is a sign it is working. It helps with any material.',
            },
            {
              id: 'spacing-q2',
              type: 'cloze',
              prompt: 'Complete the sentence.',
              text: 'Reviewing just as a memory starts to {{verb}} makes the next forgetting {{speed}}.',
              gaps: [
                { id: 'verb', accepted: ['fade', 'weaken', 'decay'] },
                { id: 'speed', accepted: ['slower'], options: ['slower', 'faster'] },
              ],
              explanation: 'Each well-timed review flattens the forgetting curve.',
            },
          ],
        },
      ],
    },
    {
      id: 'mixing',
      title: 'Mix your topics',
      summary: 'Why practising one thing at a time feels better and works worse.',
      minutes: 3,
      blocks: [
        {
          type: 'text',
          markdown:
            'Practising one type of problem in a block lets you repeat the same method without thinking. Mixing types forces you to decide which method applies, and choosing is the skill a real test demands.\n\nThis is called **interleaving**. It feels slower and scores worse during practice, then scores better later.',
        },
      ],
      assessments: [
        {
          id: 'mixing-test',
          title: 'Lesson check',
          mode: 'test',
          passMark: 0.5,
          questions: [
            {
              id: 'mixing-q1',
              type: 'single_choice',
              prompt: 'What does interleaving train that blocked practice does not?',
              options: ['Speed', 'Choosing which method fits the problem', 'Neat handwriting'],
              answer: 1,
              explanation: 'With mixed problems you must first recognise the type, which blocked practice never asks of you.',
            },
            {
              id: 'mixing-q2',
              type: 'essay',
              prompt:
                'A friend says: "I study one chapter until I know it perfectly, then move on." In a few sentences, explain what you would change and why.',
              modelAnswer:
                'Stop when the chapter is roughly understood, not perfect, and come back to it on later days. Mix questions from earlier chapters into every session. Returning after a gap and switching between topics both make recall harder in the moment, and that effort is what makes the knowledge last.',
              rubric:
                'Full marks for mentioning both spacing (returning after a gap) and mixing topics, with a reason for each. Half marks for only one of them.',
              minWords: 25,
            },
          ],
        },
      ],
    },
  ],
  finalExam: {
    id: 'final',
    title: 'Final exam',
    mode: 'exam',
    passMark: 0.7,
    questions: [
      {
        id: 'final-q1',
        type: 'single_choice',
        prompt: 'Which plan uses 60 minutes best for an exam in two weeks?',
        options: [
          'One 60 minute session tonight',
          'Four 15 minute sessions on different days, each starting with a self-test',
          'Two 30 minute sessions rereading the notes',
        ],
        answer: 1,
        explanation: 'It combines spacing with retrieval practice.',
      },
      {
        id: 'final-q2',
        type: 'true_false',
        prompt: 'If practice feels easy, it is a sign that you are learning efficiently.',
        answer: false,
        explanation: 'Effective techniques usually feel harder. Ease often means the material is only familiar.',
      },
      {
        id: 'final-q3',
        type: 'short_answer',
        prompt: 'What is mixing different problem types in one session called?',
        accepted: ['interleaving', 'interleaved practice'],
      },
    ],
  },
} as const;

export const sampleQuizInput = {
  format: 'quiz/1',
  id: 'sample-git',
  title: 'Git in ten minutes',
  description: 'A standalone quiz on the handful of Git ideas everything else builds on.',
  language: 'en',
  level: 'beginner',
  tags: ['git', 'programming'],
  assessment: {
    id: 'git-quiz',
    mode: 'practice',
    questions: [
      {
        id: 'git-q1',
        type: 'single_choice',
        prompt: 'What does a commit store?',
        options: ['A snapshot of the whole project', 'Only the lines that changed', 'A copy of one file'],
        answer: 0,
        explanation: 'Git records a snapshot of every tracked file and computes differences when you ask for them.',
      },
      {
        id: 'git-q2',
        type: 'true_false',
        prompt: 'A branch is a full copy of the repository.',
        answer: false,
        explanation: 'A branch is a small movable pointer to one commit, which is why creating one is instant.',
      },
      {
        id: 'git-q3',
        type: 'cloze',
        prompt: 'Fill in the commands.',
        text: 'Run git {{stage}} to stage a file and git {{save}} to record the staged changes.',
        gaps: [
          { id: 'stage', accepted: ['add'] },
          { id: 'save', accepted: ['commit'] },
        ],
      },
      {
        id: 'git-q4',
        type: 'multiple_choice',
        prompt: 'Which commands change only your local repository?',
        options: ['git commit', 'git push', 'git branch', 'git fetch'],
        answers: [0, 2],
        explanation:
          'Commit and branch are purely local. Push sends to a remote, and fetch downloads from one into your local repository.',
      },
      {
        id: 'git-q5',
        type: 'short_answer',
        prompt: 'Which command shows the history of commits?',
        accepted: ['git log', 'log'],
      },
    ],
  },
} as const;

export const sampleDeckInput = {
  format: 'deck/1',
  id: 'sample-shortcuts',
  title: 'Everyday keyboard shortcuts',
  description: 'Ten shortcuts that work in almost every desktop app. Shown for Windows and Linux, with Mac in brackets.',
  language: 'en',
  level: 'beginner',
  tags: ['productivity'],
  cards: [
    { id: 'k1', type: 'flashcard', prompt: 'Undo the last action', back: 'Ctrl + Z (Cmd + Z)' },
    { id: 'k2', type: 'flashcard', prompt: 'Redo what you just undid', back: 'Ctrl + Y or Ctrl + Shift + Z (Cmd + Shift + Z)' },
    { id: 'k3', type: 'flashcard', prompt: 'Select everything', back: 'Ctrl + A (Cmd + A)' },
    { id: 'k4', type: 'flashcard', prompt: 'Find text on the page', back: 'Ctrl + F (Cmd + F)' },
    { id: 'k5', type: 'flashcard', prompt: 'Paste without formatting', back: 'Ctrl + Shift + V (Cmd + Shift + V)' },
    { id: 'k6', type: 'flashcard', prompt: 'Switch between open apps', back: 'Alt + Tab (Cmd + Tab)' },
    { id: 'k7', type: 'flashcard', prompt: 'Reopen the browser tab you just closed', back: 'Ctrl + Shift + T (Cmd + Shift + T)' },
    { id: 'k8', type: 'flashcard', prompt: 'Jump to the address bar in a browser', back: 'Ctrl + L (Cmd + L)' },
    { id: 'k9', type: 'flashcard', prompt: 'Move the cursor one word at a time', back: 'Ctrl + Arrow (Option + Arrow)' },
    { id: 'k10', type: 'flashcard', prompt: 'Save the current file', back: 'Ctrl + S (Cmd + S)' },
  ],
} as const;

export const sampleInputs = [sampleCourseInput, sampleQuizInput, sampleDeckInput] as const;
