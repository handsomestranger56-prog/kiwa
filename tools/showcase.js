// Example content for the project page's screenshots, written in each language the app speaks.
// One group holding a course (with an animated SVG picture), a quiz and a set of flashcards.

const COPY = {
  en: {
    group: 'Learning science',
    course: 'How memory works',
    courseDescription: 'Why we forget, and three habits that make learning stick.',
    lessons: [
      {
        title: 'The forgetting curve',
        summary: 'Memories fade fast at first, then slower.',
        text: 'A day after learning something new, most people recall less than half of it. The drop is steep at first and then levels off.\n\nEvery time you **recall** the idea again, the curve flattens and the memory lasts longer.',
        tip: 'Review just before you would forget: after a day, then three days, then a week.',
        alt: 'A falling curve that resets higher after each review',
        caption: 'Each review lifts the memory and slows the fall.',
        question: { prompt: 'When is forgetting fastest?', options: ['Right after learning', 'After a month', 'It is the same every day'], answer: 0, explanation: 'The curve drops steeply in the first hours and days.' },
      },
      {
        title: 'Spacing your practice',
        summary: 'Short sessions spread out beat one long session.',
        text: 'Ten minutes on three different days teaches more than thirty minutes in one sitting. The gaps make your brain work to retrieve the idea, and that effort is what makes it stick.',
        question: { prompt: 'Spacing practice out over several days helps you remember for longer.', answer: true, explanation: 'The effort of recalling after a gap strengthens the memory.' },
      },
      {
        title: 'Testing yourself',
        summary: 'Recalling an answer teaches more than rereading it.',
        text: 'Closing the book and answering a question feels harder than rereading, and that is why it works. Mistakes are useful too: they show you exactly what to review.',
        question: { prompt: 'Which habit helps memory most?', options: ['Rereading notes', 'Answering questions from memory', 'Highlighting'], answer: 1, explanation: 'Retrieval practice beats rereading in study after study.' },
      },
    ],
    labels: { today: 'today', d1: '1 day', d3: '3 days', w1: '1 week', memory: 'memory' },
    quiz: 'Memory basics',
    order: { prompt: 'Put the reviews in order.', items: ['Learn it today', 'Review after a day', 'Review after three days', 'Review after a week'] },
    single: { prompt: 'What makes a memory last longer?', options: ['Recalling it again', 'Reading faster', 'Studying late at night'], answer: 0 },
    tf: { prompt: 'Mistakes during practice are wasted effort.', answer: false },
    deck: 'Study terms',
    cards: [
      ['Spaced repetition', 'Reviewing at growing intervals'],
      ['Retrieval practice', 'Recalling without looking'],
      ['Interleaving', 'Mixing different kinds of problems'],
      ['Forgetting curve', 'How memory fades over time'],
    ],
    topic: 'The basics of personal budgeting, brief, for students',
    genTopic: 'Photosynthesis for 12-year-olds',
    outline: { title: 'Photosynthesis', description: 'How plants turn light into food.', lessons: ['What plants need', 'Inside a leaf', 'Light into sugar', 'Why it matters to us'] },
  },
  uz: {
    group: 'Oʻrganish ilmi',
    course: 'Xotira qanday ishlaydi',
    courseDescription: 'Nega unutamiz va bilimni mustahkamlaydigan uchta odat.',
    lessons: [
      {
        title: 'Unutish egri chizigʻi',
        summary: 'Xotira avval tez, keyin sekinroq soʻnadi.',
        text: 'Yangi narsani oʻrgangandan bir kun oʻtib, koʻpchilik uning yarmidan kamini eslaydi. Avvaliga pasayish keskin, keyin sekinlashadi.\n\nGʻoyani har safar qayta **eslaganingizda** egri chiziq tekislanadi va xotira uzoqroq saqlanadi.',
        tip: 'Unutishingizdan oldin takrorlang: bir kundan, keyin uch kundan, keyin bir haftadan soʻng.',
        alt: 'Har bir takrorlashdan keyin yuqoriroqdan boshlanadigan pasayuvchi egri chiziq',
        caption: 'Har bir takrorlash xotirani koʻtaradi va soʻnishni sekinlashtiradi.',
        question: { prompt: 'Unutish qachon eng tez boʻladi?', options: ['Oʻrgangandan keyin darhol', 'Bir oydan keyin', 'Har kuni bir xil'], answer: 0, explanation: 'Egri chiziq dastlabki soat va kunlarda keskin tushadi.' },
      },
      {
        title: 'Mashgʻulotlarni taqsimlash',
        summary: 'Bir necha qisqa mashgʻulot bitta uzun mashgʻulotdan yaxshiroq.',
        text: 'Uch xil kunda oʻn daqiqadan shugʻullanish bir oʻtirishda oʻttiz daqiqadan koʻproq oʻrgatadi. Oraliqlar miyani gʻoyani eslashga majbur qiladi va aynan shu harakat bilimni mustahkamlaydi.',
        question: { prompt: 'Mashgʻulotlarni bir necha kunga taqsimlash uzoqroq eslab qolishga yordam beradi.', answer: true, explanation: 'Oraliqdan keyin eslash harakati xotirani kuchaytiradi.' },
      },
      {
        title: 'Oʻzingizni tekshirish',
        summary: 'Javobni eslash qayta oʻqishdan koʻproq oʻrgatadi.',
        text: 'Kitobni yopib savolga javob berish qayta oʻqishdan qiyinroq tuyuladi va aynan shuning uchun foyda beradi. Xatolar ham foydali: ular nimani takrorlash kerakligini aniq koʻrsatadi.',
        question: { prompt: 'Qaysi odat xotiraga eng koʻp yordam beradi?', options: ['Qaydlarni qayta oʻqish', 'Savollarga yoddan javob berish', 'Matnni belgilash'], answer: 1, explanation: 'Eslash mashqi qayta oʻqishdan doim samaraliroq.' },
      },
    ],
    labels: { today: 'bugun', d1: '1 kun', d3: '3 kun', w1: '1 hafta', memory: 'xotira' },
    quiz: 'Xotira asoslari',
    order: { prompt: 'Takrorlashlarni tartibga soling.', items: ['Bugun oʻrganish', 'Bir kundan keyin takrorlash', 'Uch kundan keyin takrorlash', 'Bir haftadan keyin takrorlash'] },
    single: { prompt: 'Xotirani nima uzoqroq saqlaydi?', options: ['Uni qayta eslash', 'Tezroq oʻqish', 'Kechasi oʻqish'], answer: 0 },
    tf: { prompt: 'Mashq paytidagi xatolar behuda mehnat.', answer: false },
    deck: 'Atamalar',
    cards: [
      ['Oraliqli takrorlash', 'Ortib boruvchi oraliqlarda takrorlash'],
      ['Eslash mashqi', 'Qaramasdan eslash'],
      ['Aralashtirish', 'Har xil turdagi masalalarni aralashtirish'],
      ['Unutish egri chizigʻi', 'Xotiraning vaqt oʻtishi bilan soʻnishi'],
    ],
    topic: 'Shaxsiy byudjet asoslari, qisqacha, talabalar uchun',
    genTopic: '12 yoshli bolalar uchun fotosintez',
    outline: { title: 'Fotosintez', description: 'Oʻsimliklar yorugʻlikni qanday qilib ozuqaga aylantiradi.', lessons: ['Oʻsimliklarga nima kerak', 'Barg ichida', 'Yorugʻlikdan shakar', 'Bu biz uchun nega muhim'] },
  },
  ru: {
    group: 'Наука обучения',
    course: 'Как работает память',
    courseDescription: 'Почему мы забываем и три привычки, которые помогают запоминать.',
    lessons: [
      {
        title: 'Кривая забывания',
        summary: 'Память сначала угасает быстро, потом медленнее.',
        text: 'Через день после изучения нового большинство людей помнит меньше половины. Сначала спад резкий, потом он замедляется.\n\nКаждый раз, когда вы снова **вспоминаете** идею, кривая выравнивается и память держится дольше.',
        tip: 'Повторяйте прямо перед тем, как забыть: через день, потом через три дня, потом через неделю.',
        alt: 'Падающая кривая, которая после каждого повторения начинается выше',
        caption: 'Каждое повторение поднимает память и замедляет спад.',
        question: { prompt: 'Когда забывание идёт быстрее всего?', options: ['Сразу после изучения', 'Через месяц', 'Каждый день одинаково'], answer: 0, explanation: 'Кривая резко падает в первые часы и дни.' },
      },
      {
        title: 'Распределённая практика',
        summary: 'Несколько коротких занятий лучше одного длинного.',
        text: 'Десять минут в три разных дня дают больше, чем тридцать минут за один раз. Перерывы заставляют мозг вспоминать, и именно это усилие закрепляет знания.',
        question: { prompt: 'Распределение занятий на несколько дней помогает помнить дольше.', answer: true, explanation: 'Усилие вспомнить после перерыва укрепляет память.' },
      },
      {
        title: 'Проверяйте себя',
        summary: 'Вспомнить ответ полезнее, чем перечитать.',
        text: 'Закрыть книгу и ответить на вопрос труднее, чем перечитать, и поэтому это работает. Ошибки тоже полезны: они точно показывают, что повторить.',
        question: { prompt: 'Какая привычка лучше всего помогает памяти?', options: ['Перечитывать конспект', 'Отвечать на вопросы по памяти', 'Выделять маркером'], answer: 1, explanation: 'Вспоминание раз за разом оказывается эффективнее перечитывания.' },
      },
    ],
    labels: { today: 'сегодня', d1: '1 день', d3: '3 дня', w1: '1 неделя', memory: 'память' },
    quiz: 'Основы памяти',
    order: { prompt: 'Расставьте повторения по порядку.', items: ['Изучить сегодня', 'Повторить через день', 'Повторить через три дня', 'Повторить через неделю'] },
    single: { prompt: 'Что помогает памяти держаться дольше?', options: ['Снова вспоминать', 'Читать быстрее', 'Учить поздно ночью'], answer: 0 },
    tf: { prompt: 'Ошибки во время практики — напрасный труд.', answer: false },
    deck: 'Термины',
    cards: [
      ['Интервальное повторение', 'Повторение через растущие промежутки'],
      ['Практика вспоминания', 'Вспоминать, не подглядывая'],
      ['Чередование', 'Смешивать задачи разных типов'],
      ['Кривая забывания', 'Как память угасает со временем'],
    ],
    topic: 'Основы личного бюджета, кратко, для студентов',
    genTopic: 'Фотосинтез для 12-летних',
    outline: { title: 'Фотосинтез', description: 'Как растения превращают свет в пищу.', lessons: ['Что нужно растениям', 'Внутри листа', 'Свет превращается в сахар', 'Почему это важно для нас'] },
  },
};

/** The forgetting curve, drawn and then redrawn after each review. Animated with CSS. */
function curve(labels) {
  return [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 170'>",
    '<style>.c{fill:none;stroke:#1f9aa8;stroke-width:3.5;stroke-linecap:round;stroke-dasharray:520;stroke-dashoffset:520;animation:d 3.2s ease-out forwards}.f{fill:none;stroke:#e0894a;stroke-width:2;stroke-dasharray:4 5;opacity:.85}.p{fill:#1f9aa8;animation:b 1.6s ease-in-out infinite}.t{font:600 11px sans-serif;fill:#7a8696}@keyframes d{to{stroke-dashoffset:0}}@keyframes b{50%{opacity:.35}}</style>',
    "<line x1='30' y1='140' x2='308' y2='140' stroke='#9aa6b5' stroke-width='1.5'/>",
    "<line x1='30' y1='18' x2='30' y2='140' stroke='#9aa6b5' stroke-width='1.5'/>",
    `<text class='t' x='34' y='14'>${labels.memory}</text>`,
    "<path class='f' d='M30 26 C60 90 90 120 300 132'/>",
    "<path class='c' d='M30 26 C44 66 56 80 70 86 L70 34 C92 70 112 84 130 88 L130 38 C162 66 190 78 210 80 L210 42 C246 56 278 62 300 64'/>",
    "<circle class='p' cx='70' cy='34' r='5'/><circle class='p' cx='130' cy='38' r='5' style='animation-delay:.4s'/><circle class='p' cx='210' cy='42' r='5' style='animation-delay:.8s'/>",
    `<text class='t' x='22' y='158'>${labels.today}</text><text class='t' x='58' y='158'>${labels.d1}</text><text class='t' x='116' y='158'>${labels.d3}</text><text class='t' x='192' y='158'>${labels.w1}</text>`,
    '</svg>',
  ].join('');
}

function showcase(lang) {
  const c = COPY[lang];
  const ids = ['forgetting-curve', 'spacing', 'testing'];
  const course = {
    format: 'course/1',
    id: 'kiwa-memory',
    title: c.course,
    description: c.courseDescription,
    language: lang,
    level: 'beginner',
    tags: [],
    lessons: c.lessons.map((lesson, index) => {
      const blocks = [{ type: 'text', markdown: lesson.text }];
      if (index === 0) {
        blocks.push({ type: 'svg', svg: curve(c.labels), alt: lesson.alt, caption: lesson.caption });
        blocks.push({ type: 'callout', tone: 'tip', markdown: lesson.tip });
      }
      const q = lesson.question;
      const question =
        typeof q.answer === 'boolean'
          ? { id: `${ids[index]}-q1`, type: 'true_false', prompt: q.prompt, answer: q.answer, explanation: q.explanation }
          : { id: `${ids[index]}-q1`, type: 'single_choice', prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation };
      return { id: ids[index], title: lesson.title, summary: lesson.summary, minutes: 3, blocks, assessments: [{ id: `${ids[index]}-practice`, mode: 'practice', questions: [question] }] };
    }),
  };
  const quiz = {
    format: 'quiz/1',
    id: 'kiwa-quiz',
    title: c.quiz,
    language: lang,
    level: 'beginner',
    tags: [],
    assessment: {
      id: 'kiwa-quiz-main',
      mode: 'test',
      passMark: 0.6,
      questions: [
        { id: 'order', type: 'ordering', prompt: c.order.prompt, items: c.order.items },
        { id: 'single', type: 'single_choice', prompt: c.single.prompt, options: c.single.options, answer: c.single.answer },
        { id: 'tf', type: 'true_false', prompt: c.tf.prompt, answer: c.tf.answer },
      ],
    },
  };
  const deck = {
    format: 'deck/1',
    id: 'kiwa-terms',
    title: c.deck,
    language: lang,
    level: 'beginner',
    tags: [],
    cards: c.cards.map(([front, back], index) => ({ id: `term-${index + 1}`, type: 'flashcard', prompt: front, back })),
  };
  return { file: { format: 'group/1', name: c.group, items: [course, quiz, deck] }, copy: c };
}

module.exports = { showcase };
