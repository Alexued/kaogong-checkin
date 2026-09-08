import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const activities = ['idle', 'walk', 'run', 'jump', 'rope', 'climb', 'read', 'write', 'think', 'celebrate', 'dance', 'sleep', 'wash', 'bath', 'brush', 'exercise', 'meditate', 'music', 'paint', 'cook', 'game', 'eat'];
export const characters = {
  cat: { fur: '#e8ab73', pale: '#fff1da', dark: '#885337', ears: 'point', tail: 'curl', eyes: 'cat', rhythm: 1 },
  shiba: { fur: '#d99654', pale: '#fff2d4', dark: '#764b35', ears: 'point', tail: 'ring', eyes: 'dog', rhythm: 1.15 },
  rabbit: { fur: '#f5e7e4', pale: '#fff8f1', dark: '#997d86', ears: 'long', tail: 'puff', eyes: 'round', rhythm: 1.2 },
  panda: { fur: '#fff4df', pale: '#fff9eb', dark: '#444f50', ears: 'round', tail: 'puff', eyes: 'patch', rhythm: .8 },
  fox: { fur: '#e1844b', pale: '#fff1d7', dark: '#795144', ears: 'tall', tail: 'fox', eyes: 'fox', rhythm: 1.1 },
  otter: { fur: '#a8866a', pale: '#f2d9b0', dark: '#655144', ears: 'small', tail: 'long', eyes: 'whiskers', rhythm: .95 },
  penguin: { fur: '#405966', pale: '#fff2d8', dark: '#344956', ears: 'none', tail: 'puff', eyes: 'beak', rhythm: .85 },
  bear: { fur: '#c0956e', pale: '#f5dfba', dark: '#755441', ears: 'round', tail: 'puff', eyes: 'round', rhythm: .75 },
  hedgehog: { fur: '#c4a580', pale: '#f9e5c4', dark: '#81644a', ears: 'small', tail: 'spines', eyes: 'nose', rhythm: .8 },
  dragon: { fur: '#83bfa4', pale: '#e8e9b9', dark: '#476e60', ears: 'horn', tail: 'dragon', eyes: 'dragon', rhythm: 1.05 },
};
const ellipse = (cx, cy, rx, ry, fill, rest = '') => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '" ' + rest + '/>';
const path = (shape, fill, rest = '') => '<path d="' + shape + '" fill="' + fill + '" ' + rest + '/>';
const line = (shape, color = '#70594d', width = 2) => path(shape, 'none', 'stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"');
const group = (transform, content) => '<g transform="' + transform + '">' + content + '</g>';
const roundRect = (x, y, width, height, fill, radius = 3) => '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="' + fill + '"/>';

export function poseFor(activity, frame, rhythm = 1) {
  const swing = [-1, -.25, 1, .25][frame] * rhythm;
  const pose = { left: -10, right: 10, leg: 0, head: swing * 2, rise: [0, -1, -2, -.5][frame], tilt: 0, closed: false, mouth: false };
  switch (activity) {
    case 'walk': pose.left = swing * 26; pose.right = -pose.left; pose.leg = swing * 18; break;
    case 'run': pose.left = swing * 55; pose.right = -pose.left; pose.leg = swing * 38; pose.tilt = 7; pose.rise *= 2; break;
    case 'jump': pose.rise = [4, -4, -13, -3][frame]; pose.left = [-15, 45, 85, 10][frame]; pose.right = -pose.left; pose.leg = [10, -8, 24, -14][frame]; break;
    case 'rope': pose.rise = [2, -8, -12, -2][frame]; pose.left = [15, 35, 50, 28][frame]; pose.right = -pose.left; pose.leg = frame * 3; break;
    case 'climb': pose.left = [120, 70, 20, 60][frame]; pose.right = -[20, 60, 120, 70][frame]; pose.leg = swing * 25; pose.rise -= frame * 2; break;
    case 'read': pose.left = 15 + frame * 3; pose.right = -30 - swing * 15; pose.head = 7 + swing; break;
    case 'write': pose.left = 12; pose.right = -40 - frame * 9; pose.head = 12 - frame; break;
    case 'think': pose.left = 10; pose.right = -125 + swing * 8; pose.head = -12 + frame * 4; break;
    case 'celebrate': pose.left = 100 + swing * 25; pose.right = -120 + swing * 20; pose.rise *= 3; break;
    case 'dance': pose.left = 60 + swing * 45; pose.right = -60 + swing * 45; pose.leg = swing * 15; pose.tilt = swing * 9; break;
    case 'sleep': pose.closed = true; pose.head = 15 + swing; pose.left = 10 + frame; pose.right = -40 - frame; pose.tilt = 12; pose.rise += 5; break;
    case 'wash': pose.left = 132 + swing * 18; pose.right = -132 - swing * 18; pose.closed = frame % 2 === 0; break;
    case 'bath': pose.left = 50 + swing * 30; pose.right = -50 - swing * 30; pose.head = swing * 4; break;
    case 'brush': pose.left = 12; pose.right = -140 + swing * 12; pose.mouth = true; break;
    case 'exercise': pose.left = [140, 75, 20, 80][frame]; pose.right = -[20, 80, 140, 75][frame]; pose.tilt = swing * 8; pose.leg = swing * 6; break;
    case 'meditate': pose.left = 65 + frame * 2; pose.right = -65 - frame * 2; pose.closed = true; pose.leg = 40; break;
    case 'music': pose.left = 15 + swing * 10; pose.right = -30 + swing * 10; pose.head = swing * 8; pose.tilt = swing * 5; break;
    case 'paint': pose.left = 10; pose.right = -65 + swing * 25; pose.head = 8; break;
    case 'cook': pose.left = 12; pose.right = -30 + swing * 14; pose.head = swing * 3; break;
    case 'game': pose.left = 30 + frame * 2; pose.right = -32 - frame * 2; pose.head = swing * 3; pose.mouth = frame === 2; break;
    case 'eat': pose.left = 72 + swing * 6; pose.right = -72 - swing * 6; pose.head = swing * 4; pose.mouth = frame % 2 === 0; break;
    default: pose.left += frame; pose.right -= frame; pose.closed = frame === 2;
  }
  return pose;
}

function ears(character) {
  const { fur, dark } = character;
  if (character.ears === 'long') return ellipse(48, 25, 8, 21, fur) + ellipse(80, 25, 8, 21, fur) + ellipse(48, 23, 3, 13, '#e8b9be') + ellipse(80, 23, 3, 13, '#e8b9be');
  if (character.ears === 'point' || character.ears === 'tall') return path('M34 44L35 12L56 32M72 32L92 12L94 46', fur) + path('M39 34L39 20L49 31M79 31L89 20L89 36', '#d8988c');
  if (character.ears === 'horn') return path('M39 35L38 16L51 29M77 29L89 16L89 38', '#e4d69d') + ellipse(35, 41, 9, 6, fur) + ellipse(93, 41, 9, 6, fur);
  if (character.ears === 'none') return path('M57 26Q64 12 73 29', fur);
  const radius = character.ears === 'small' ? 7 : 11;
  return ellipse(40, 34, radius, radius, character.eyes === 'patch' ? dark : fur) + ellipse(88, 34, radius, radius, character.eyes === 'patch' ? dark : fur) + ellipse(40, 34, radius / 2, radius / 2, '#d4a293') + ellipse(88, 34, radius / 2, radius / 2, '#d4a293');
}
function tail(character, phase) {
  const { fur, dark, pale } = character;
  const rotate = 'rotate(' + (phase * 5 - 8) + ' 80 85)';
  let content = '';
  switch (character.tail) {
    case 'curl': content = line('M83 96Q113 106 107 76Q104 65 98 74', fur, 12) + line('M107 84L100 83M106 92L99 89', dark, 3); break;
    case 'ring': content = ellipse(91, 83, 17, 18, fur) + ellipse(91, 83, 9, 10, pale); break;
    case 'fox': content = path('M76 101Q126 106 110 62Q100 81 78 81Z', fur) + path('M110 62Q122 84 110 91L102 82Z', pale); break;
    case 'long': content = path('M80 88Q101 82 114 105Q89 106 78 99Z', fur); break;
    case 'spines': content = path('M26 96L16 80L26 77L18 60L30 58L26 40L41 44L47 26L59 36L73 26L80 41L97 37L96 53L112 58L104 73L115 85L100 101Z', dark); break;
    case 'dragon': content = path('M80 100Q119 110 109 62Q105 85 82 82Z', fur) + path('M105 66L117 74L111 80L119 88L110 92L114 101L103 103', '#daae76') + path('M33 68L14 58L22 88L41 82Z', '#659983'); break;
    default: content = ellipse(88, 94, 12, 10, fur);
  }
  return group(rotate, content);
}
function face(character, pose, frame) {
  const { fur, pale, dark, eyes } = character;
  let content = ears(character) + ellipse(64, 50, eyes === 'nose' ? 27 : 32, 27, fur);
  if (['cat', 'dog', 'fox'].includes(eyes)) content += path('M37 55Q45 52 53 56Q64 62 75 56Q85 52 91 55Q86 75 64 76Q42 75 37 55', pale);
  if (eyes === 'beak') content += ellipse(53, 51, 15, 22, pale) + ellipse(75, 51, 15, 22, pale);
  if (eyes === 'patch') content += ellipse(49, 49, 9, 11, dark, 'transform="rotate(25 49 49)"') + ellipse(79, 49, 9, 11, dark, 'transform="rotate(-25 79 49)"');
  if (eyes === 'cat') content += line('M58 29L62 36L65 29L69 36L72 29', dark, 2) + line('M35 46L42 48M86 48L93 46', dark, 2);
  if (eyes === 'dragon') content += ellipse(64, 32, 4, 6, '#598976') + ellipse(58, 63, 1, 1, dark) + ellipse(70, 63, 1, 1, dark);
  if (pose.closed) content += line('M46 50Q50 53 54 50M74 50Q78 53 82 50', dark, 2.4);
  else content += ellipse(50, 49, 3.3, eyes === 'fox' ? 3 : 4.6, eyes === 'patch' ? '#fff8eb' : '#343e3c') + ellipse(78, 49, 3.3, eyes === 'fox' ? 3 : 4.6, eyes === 'patch' ? '#fff8eb' : '#343e3c') + ellipse(51, 47, 1, 1.2, '#ffffff') + ellipse(79, 47, 1, 1.2, '#ffffff');
  content += ellipse(43, 58, 5, 2.5, '#df9290', 'opacity=".6"') + ellipse(85, 58, 5, 2.5, '#df9290', 'opacity=".6"');
  if (eyes === 'beak') content += path('M56 60L64 56L73 60L64 66Z', '#dfa24e');
  else {
    if (['round', 'whiskers', 'nose', 'dog'].includes(eyes)) content += ellipse(64, 64, 13, 8, pale);
    content += path('M60 59Q64 57 68 59L64 63Z', eyes === 'nose' ? '#3e3833' : dark) + (pose.mouth ? ellipse(64, 67, 3 + frame % 2, 3, '#ac6c69') : line('M64 63L64 66M58 66Q61 70 64 66Q67 70 70 66', dark, 1.5));
  }
  if (['cat', 'whiskers'].includes(eyes)) content += line('M33 57L44 60M34 65L44 63M84 60L95 57M84 63L94 65', dark, 1.1);
  return group('rotate(' + pose.head + ' 64 64)', content);
}
function activityProps(activity, frame) {
  const phase = [-1, 0, 1, .35][frame];
  const book = path('M43 78Q54 74 64 80Q76 74 86 78L86 96Q74 91 64 97Q54 91 43 96Z', '#fcf4dd') + line('M64 80L64 96M47 82L58 84M70 84L81 81', '#8caaa7', 1.2);
  const pencil = group('rotate(' + phase * 12 + ' 86 77)', line('M79 87L92 65', '#d99c47', 4) + path('M77 90L79 84L83 87Z', '#574d46'));
  switch (activity) {
    case 'rope': return '<ellipse cx="64" cy="71" rx="49" ry="' + [39, 22, 47, 30][frame] + '" fill="none" stroke="#729ca4" stroke-width="2.3"/>' + line('M26 80L31 88M97 80L102 88', '#daae76', 4);
    case 'climb': return line('M35 113L35 15M94 113L94 15M35 25L94 25M35 47L94 47M35 70L94 70M35 92L94 92', '#b58d65', 3);
    case 'read': return book + path('M64 80Q' + (70 + frame * 3) + ' 68 81 76L64 96', '#f7ead1');
    case 'write': return book + pencil;
    case 'think': return ellipse(99, 34 + phase, 3, 3, '#cfb477') + ellipse(106, 24 + phase, 7, 6, '#eee0b8');
    case 'celebrate': return [0, 1, 2, 3].map(index => group('translate(' + (16 + index * 30) + ' ' + (20 + ((index + frame) % 4) * 7) + ') rotate(' + frame * 30 + ')', path('M0 -4L1 -1L4 0L1 1L0 4L-1 1L-4 0L-1 -1Z', ['#e3b55d', '#83bfa4'][index % 2]))).join('');
    case 'sleep': return line('M94 34L101 34L94 40L101 40M101 19L111 19L101 27L111 27', '#819da7', 1.7);
    case 'wash': return ellipse(38, 59 + phase * 3, 3, 4, '#a7d9df') + ellipse(91, 57 - phase * 3, 3, 4, '#a7d9df');
    case 'bath': return roundRect(26, 89, 76, 23, '#8bbbc5', 10) + [0, 1, 2, 3, 4].map(index => ellipse(32 + index * 16, 88 + ((index + frame) % 3) * 2, 9, 6, '#effaff')).join('');
    case 'brush': return group('translate(' + phase * 3 + ' 0)', line('M64 66L95 70', '#89bab6', 3) + roundRect(62, 63, 10, 6, '#fff8e9', 2));
    case 'exercise': return line('M23 61L39 61M89 61L105 61', '#7c929b', 4) + roundRect(20, 55, 5, 13, '#75909b') + roundRect(103, 55, 5, 13, '#75909b');
    case 'meditate': return path('M35 113Q48 100 64 109Q80 100 94 113Z', '#b9c9ad');
    case 'music': return line('M32 50Q31 17 64 19Q98 17 96 50', '#8798b4', 5) + roundRect(29, 42, 8, 18, '#8798b4') + roundRect(91, 42, 8, 18, '#8798b4') + line('M104 45L104 32L113 30L113 40', '#8d9eae', 2) + ellipse(101, 45, 3, 2, '#8d9eae');
    case 'paint': return line('M85 113L95 68L106 113', '#b7936a', 3) + roundRect(83, 61, 26, 30, '#fcf4dd') + line('M88 82Q96 ' + (60 + frame * 5) + ' 105 74', '#89b9a0', 3) + pencil;
    case 'cook': return roundRect(43, 85, 45, 21, '#97adad', 7) + ellipse(65, 85, 22, 5, '#6d8b8b') + line('M' + (59 + frame * 4) + ' 87L79 66', '#bd9365', 3) + line('M52 77Q48 72 54 68M62 75Q58 69 65 64', '#d8dbcd', 2);
    case 'game': return roundRect(43, 78, 43, 22, '#7f9dae', 6) + roundRect(55, 82, 18, 12, '#d8e4cf', 2) + line('M46 87L52 87M49 84L49 90', '#eef3e8', 1.8) + ellipse(79, 86 + frame % 2, 2, 2, '#e2b4a4');
    case 'eat': return ellipse(61, 78 + phase, 9, 10, '#de8a75') + ellipse(69, 78 + phase, 8, 10, '#de8a75') + line('M65 69L66 63', '#8a725a', 2) + ellipse(72, 65, 5, 2, '#8ab394');
    default: return '';
  }
}

export function renderFrame(id, activity, frame) {
  const character = characters[id];
  if (!character || !activities.includes(activity) || !Number.isInteger(frame) || frame < 0 || frame > 3) throw new Error('Invalid pet frame');
  const pose = poseFor(activity, frame, character.rhythm);
  const { fur, pale, dark } = character;
  const limb = character.eyes === 'patch' ? dark : fur;
  const feet = character.eyes === 'beak' ? '#dca251' : limb;
  let body = tail(character, frame) + ellipse(64, 86, character.eyes === 'beak' ? 26 : 24, 26, fur) + ellipse(64, 87, 16, 19, pale);
  if (id === 'dragon') body += line('M53 82L75 82M51 89L77 89M54 97L74 97', '#c7ca9e', 1.4);
  body += group('rotate(' + pose.leg + ' 51 100)', ellipse(48, 106, 11, 7, feet)) + group('rotate(' + -pose.leg + ' 77 100)', ellipse(80, 106, 11, 7, feet));
  body += face(character, pose, frame);
  body += group('rotate(' + pose.left + ' 43 77)', ellipse(40, 85, character.eyes === 'beak' ? 6 : 8, 14, limb)) + group('rotate(' + pose.right + ' 85 77)', ellipse(88, 85, character.eyes === 'beak' ? 6 : 8, 14, limb));
  const props = activityProps(activity, frame);
  if (activity === 'climb') body = props + body;
  else body += props;
  return '<g data-species="' + id + '" data-activity="' + activity + '" data-frame="' + frame + '">' + group('translate(9 12) scale(.86)', ellipse(64, 115, 27, 3, '#a29b86', 'opacity=".12"') + group('translate(0 ' + pose.rise + ') rotate(' + pose.tilt + ' 64 90)', body)) + '</g>';
}
export function renderAtlas(id) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1408" viewBox="0 0 1024 1408">' + activities.flatMap((activity, activityIndex) => [0, 1, 2, 3].map(frame => {
    const index = activityIndex * 4 + frame;
    return '<svg x="' + index % 8 * 128 + '" y="' + Math.floor(index / 8) * 128 + '" width="128" height="128" viewBox="0 0 128 128" overflow="hidden">' + renderFrame(id, activity, frame) + '</svg>';
  })).join('') + '</svg>\n';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = new URL('../src/assets/pet/species/', import.meta.url);
  await mkdir(destination, { recursive: true });
  for (const id of Object.keys(characters)) await writeFile(new URL(id + '.svg', destination), renderAtlas(id));
  console.log('Rendered 10 original SVG atlases: 22 activities x 4 articulated frames each.');
}
