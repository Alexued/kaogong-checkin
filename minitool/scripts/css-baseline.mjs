import postcss from '../../web/node_modules/postcss/lib/postcss.mjs';

function splitArguments(value) {
  const parts = []; let depth = 0; let start = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '(') depth++;
    if (value[index] === ')') depth--;
    if (value[index] === ',' && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(value.slice(start).trim()); return parts;
}
function replaceCalls(value, name, callback) {
  let start = value.indexOf(name + '(');
  while (start >= 0) {
    let depth = 1; let end = start + name.length + 1;
    while (end < value.length && depth) { if (value[end] === '(') depth++; if (value[end] === ')') depth--; end++; }
    if (depth) throw new Error('Unclosed CSS function');
    const replacement = callback(splitArguments(value.slice(start + name.length + 1, end - 1)));
    value = value.slice(0, start) + replacement + value.slice(end);
    start = value.indexOf(name + '(', start + replacement.length);
  }
  return value;
}
export function cssBaseline(source) {
  const sheet = postcss.parse(source);
  const rules = [];
  sheet.walkRules(rule => rules.push(rule));
  for (const rule of rules) {
    for (const declaration of [...rule.nodes].filter(node => node.type === 'decl')) {
      const { prop, value } = declaration;
      if (value.includes('env(')) {
        declaration.cloneBefore({ value: replaceCalls(value, 'env', () => '0px') });
        declaration.value = replaceCalls(value, 'env', args => `var(--${args[0]}, env(${args[0]}, 0px))`);
      }
      if (value.includes('color-mix(')) declaration.cloneBefore({ value: replaceCalls(value, 'color-mix', args => args[2] === 'transparent' ? args[1].replace(/\s+\d+%$/, '') : args[2]) });
      if (value.includes('clamp(')) declaration.cloneBefore({ value: replaceCalls(value, 'clamp', args => args[0]) });
      if (value.startsWith('min(') && ['width', 'height'].includes(prop)) {
        const args = splitArguments(value.slice(4, -1));
        const size = args.find(argument => /(?:%|vw|vh|calc\()/.test(argument)) || args[0];
        const limit = args.find(argument => argument !== size);
        declaration.cloneBefore({ value: size });
        if (limit) declaration.cloneBefore({ prop: 'max-' + prop, value: limit });
      }
      if (value.startsWith('max(')) declaration.cloneBefore({ value: splitArguments(value.slice(4, -1))[0].replace(/env\([^)]*\)/g, '0px') });
      if (prop === 'gap' || prop === 'column-gap' || prop === 'row-gap') {
        const simple = replaceCalls(value, 'clamp', args => args[0]); const values = postcss.list.space(simple);
        const rowGap = prop === 'column-gap' ? null : values[0];
        const columnGap = prop === 'row-gap' ? null : values[1] || values[0];
        const selectors = postcss.list.comma(rule.selector).filter(selector => !selector.includes('::'));
        if (columnGap && selectors.length) rule.parent.insertAfter(rule, postcss.rule({ selector: selectors.map(selector => `.no-flex-gap ${selector}[data-mini-flex="row"] > * + *`).join(',') }).append({ prop: 'margin-left', value: columnGap }));
        if (rowGap && selectors.length) {
          rule.parent.insertAfter(rule, postcss.rule({ selector: selectors.map(selector => `.no-flex-gap ${selector}[data-mini-flex="column"] > * + *`).join(',') }).append({ prop: 'margin-top', value: rowGap }));
          rule.parent.insertAfter(rule, postcss.rule({ selector: selectors.map(selector => `.no-flex-gap ${selector}[data-mini-wrap="true"] > *`).join(',') }).append({ prop: 'margin-bottom', value: rowGap }));
        }
        if (prop === 'gap') declaration.cloneBefore({ prop: 'grid-gap', value: simple });
      }
      if (prop === 'column-gap' || prop === 'row-gap') declaration.cloneBefore({ prop: 'grid-' + prop });
      if (prop === 'inset') {
        const parts = postcss.list.space(value); const values = [parts[0], parts[1] || parts[0], parts[2] || parts[0], parts[3] || parts[1] || parts[0]];
        ['top', 'right', 'bottom', 'left'].forEach((side, index) => declaration.cloneBefore({ prop: side, value: values[index] }));
      }
      const physical = { 'inset-inline-start': 'left', 'inset-inline-end': 'right', 'inset-block-start': 'top', 'inset-block-end': 'bottom', 'padding-inline-start': 'padding-left', 'padding-inline-end': 'padding-right' };
      if (physical[prop]) declaration.cloneBefore({ prop: physical[prop] });
      if (['inset-inline', 'padding-inline', 'margin-inline'].includes(prop)) {
        const prefix = prop === 'inset-inline' ? '' : prop.split('-')[0] + '-'; const parts = postcss.list.space(value);
        declaration.cloneBefore({ prop: prefix + 'left', value: parts[0] }); declaration.cloneBefore({ prop: prefix + 'right', value: parts[1] || parts[0] });
      }
      if (value.includes('dvh') || value.includes('svh')) declaration.cloneBefore({ value: value.replaceAll('dvh', 'vh').replaceAll('svh', 'vh') });
      if (prop === 'overflow' && value === 'clip') declaration.cloneBefore({ value: 'hidden' });
    }
    if (rule.selector.includes(':focus-visible')) rule.cloneBefore({ selector: rule.selector.replaceAll(':focus-visible', ':focus') });
  }
  return sheet.toString();
}
