// The records: letters in filing-cabinet drawers. Some are records of the
// past; many are addressed to people who don't exist yet, about problems that
// haven't happened. Generated deterministically from each letter's seed.
// (See the vault: Forward Correspondence, Records.)

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 2 ** 32;
  };
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const FIRST = ['Marta', 'Ilse', 'Oren', 'Teodor', 'Ama', 'Juniper', 'Kasimir', 'Hollis', 'Wren', 'Ottoline', 'Bram', 'Sefa', 'Dov', 'Pell', 'Ione', 'Quill', 'Ezra', 'Noor', 'Calder', 'Vesna'];
const LAST = ['Akers', 'Brannigan', 'Cotter', 'Dahl', 'Eskew', 'Fairweather', 'Galloway', 'Huxtable', 'Imrie', 'Jessop', 'Kettle', 'Lindqvist', 'Moss', 'Nakamura', 'Ollerenshaw', 'Pike', 'Quarrie', 'Rook', 'Stannard', 'Thorne'];
const PLACES = ['Hall 7-C', 'the third sub-basement of Wing 40', 'Thermal Accounting, row 12', 'the cafeteria on level 88', 'Caterpillar Room 2', 'the separator line', 'your kitchen', 'the bathroom of the house you have not yet bought', 'Procurement bay 9', 'the mixing room'];
const PROBLEMS = [
  'a valve will begin to weep',
  'the peanut butter will run short of salt',
  'a pulley will lose a tooth',
  'the beetles will leave',
  'a joint under the sink will fail',
  'the water room will run out of air',
  'a caterpillar will escape the grinder',
  'a drawer like this one will be opened by the wrong person',
  'the reference drum will be removed',
  'a pipe will freeze',
];
const ADVICE = [
  'Tighten it a quarter turn. No more.',
  'Do not open the tap. Wait.',
  'A plumber has already been scheduled.',
  'Check the salt. Always check the salt.',
  'Leave the door open for exactly one hour.',
  'Put it back the way you found it.',
  'You will want to replace it. Do not.',
  'The answer is in the drawer below this one.',
  'Ask nobody. They will not know.',
  'It is not your fault. It was always going to happen.',
];
const PAST = ['Inspected and found sound.', 'Replaced under warranty.', 'Customer satisfied.', 'Resolved before reported.', 'Filed for future reference.', 'Recurrence expected.'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface Letter {
  date: string;
  future: boolean;
  to: string;
  lines: string[];
}

export function letter(seed: number): Letter {
  const r = rng(seed);
  const future = r() < 0.6;
  const year = future ? (r() < 0.6 ? 2100 + Math.floor(r() * 900) : 3000 + Math.floor(r() * 7000)) : 1951 + Math.floor(r() * 74);
  const date = `${1 + Math.floor(r() * 28)} ${pick(r, MONTHS)} ${year}`;
  const to = `${pick(r, FIRST)} ${pick(r, LAST)}`;
  const lines = future
    ? [
        `Dear ${to.split(' ')[0]},`,
        `On ${date}, in ${pick(r, PLACES)},`,
        `${pick(r, PROBLEMS)}.`,
        pick(r, ADVICE),
        r() < 0.3 ? 'You have not been born yet. That is all right.' : 'Please keep this letter.',
        '— Forward Correspondence',
      ]
    : [
        `Record: ${to}`,
        `${pick(r, PLACES)}.`,
        `Reported that ${pick(r, PROBLEMS)}.`,
        pick(r, PAST),
        '',
        '— Records',
      ];
  return { date, future, to, lines };
}
