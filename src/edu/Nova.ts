/**
 * Nova — the in-game guide — and the adaptive maths challenges.
 * Maths never interrupts free roaming: it is offered as an optional bonus after races.
 */
export interface Question {
  text: string;
  answer: number;
  choices: number[];
  explain: string;
}

const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

function choices(answer: number, spread: number): number[] {
  const set = new Set<number>([answer]);
  let guard = 0;
  while (set.size < 3 && guard++ < 50) {
    const d = ri(1, Math.max(2, Math.round(spread))) * (Math.random() < 0.5 ? -1 : 1);
    if (answer + d >= 0) set.add(answer + d);
  }
  return [...set].sort(() => Math.random() - 0.5);
}

export const MAX_LEVEL = 8;

export function makeQuestion(level: number, ctx: { reward: number }): Question {
  switch (Math.max(1, Math.min(MAX_LEVEL, level))) {
    case 1: {
      const a = ri(3, 12);
      const b = ri(2, 9);
      return { text: `You passed ${a} cars, then ${b} more. How many cars did you pass?`, answer: a + b, choices: choices(a + b, 3), explain: `${a} + ${b} = ${a + b}` };
    }
    case 2: {
      const a = ri(12, 20);
      const b = ri(3, 11);
      return { text: `A lap has ${a} corners. You've taken ${b}. How many are left?`, answer: a - b, choices: choices(a - b, 3), explain: `${a} - ${b} = ${a - b}` };
    }
    case 3: {
      const a = ri(15, 60);
      const b = ri(12, 39);
      return { text: `Your top speed was ${a + b} km/h and the rival's was ${a} km/h. How much faster were you?`, answer: b, choices: choices(b, 6), explain: `${a + b} - ${a} = ${b}` };
    }
    case 4: {
      const a = pick([2, 5, 10]);
      const b = ri(2, 12);
      return { text: `Each checkpoint pays $${a}. You hit ${b} of them. How much did you earn?`, answer: a * b, choices: choices(a * b, a), explain: `${b} × ${a} = ${a * b}` };
    }
    case 5: {
      const a = ri(3, 9);
      const b = ri(3, 9);
      return { text: `${a} rivals each have ${b} upgrades. How many upgrades in total?`, answer: a * b, choices: choices(a * b, a), explain: `${a} × ${b} = ${a * b}` };
    }
    case 6: {
      const b = ri(3, 9);
      const ans = ri(3, 12);
      return { text: `$${b * ans} prize money is shared equally by ${b} crew members. How much does each get?`, answer: ans, choices: choices(ans, 3), explain: `${b * ans} ÷ ${b} = ${ans}` };
    }
    case 7: {
      const pct = pick([10, 20, 25, 50]);
      const base = Math.max(100, Math.round(ctx.reward / 100) * 100);
      const ans = (base * pct) / 100;
      return { text: `A tyre upgrade costs $${base}. The garage gives ${pct}% off. How many dollars do you save?`, answer: ans, choices: choices(ans, Math.max(5, ans / 4)), explain: `${pct}% of ${base} = ${ans}` };
    }
    default: {
      const v = pick([60, 80, 90, 120]);
      const mins = pick([15, 30, 45]);
      const ans = (v * mins) / 60;
      return { text: `You cruise the Coastal Highway at ${v} km/h for ${mins} minutes. How many km do you travel?`, answer: ans, choices: choices(ans, Math.max(5, ans / 3)), explain: `${v} × ${mins}/60 = ${ans} km` };
    }
  }
}

/** Adaptive difficulty: two right in a row moves up a level, a miss moves down one. */
export function adapt(m: { level: number; streak: number; correct: number; answered: number }, correct: boolean) {
  m.answered++;
  if (correct) {
    m.correct++;
    m.streak = Math.max(0, m.streak) + 1;
    if (m.streak >= 2) {
      m.level = Math.min(MAX_LEVEL, m.level + 1);
      m.streak = 0;
    }
  } else {
    m.streak = 0;
    m.level = Math.max(1, m.level - 1);
  }
}

/** Nova's pixel portrait: a holographic co-driver with a visor. */
export function drawNova(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  g.clearRect(0, 0, 24, 24);
  // racing helmet with a tinted visor, team jacket
  px(6, 2, 12, 3, '#e03a2e');
  px(4, 4, 16, 9, '#e03a2e');
  px(5, 5, 14, 8, '#f2f2f2');
  px(6, 7, 12, 4, '#2a3a52');
  px(7, 8, 3, 1, '#8aaac8');
  px(6, 12, 12, 5, '#e8c4a0');
  px(9, 14, 6, 1, '#a0604a');
  px(8, 17, 8, 2, '#e8c4a0');
  px(3, 19, 18, 5, '#24344e');
  px(11, 19, 2, 5, '#f0b429');
  px(4, 4, 1, 1, '#ffffff');
}
