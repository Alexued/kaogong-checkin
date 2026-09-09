export function selectBank(source, categories, maxCount = 200, maxBytes = 512 * 1024) {
  const eligible = source.filter(question => question.stem && question.answer && question.options.length > 0
    && !question.titleImages?.length && !question.optionImages?.some(images => images.length)
    && !/https?:\/\/|<img/i.test(JSON.stringify(question)));
  const selected = []; const ids = new Set();
  const groups = categories.map(category => eligible.filter(question => question.categories.includes(category)));
  let index = 0;
  while (selected.length < maxCount && groups.some(group => group.length > index)) {
    for (const group of groups) {
      const question = group[index];
      if (!question || ids.has(question.id) || selected.length >= maxCount) continue;
      if (Buffer.byteLength(JSON.stringify([...selected, question])) > maxBytes) continue;
      selected.push(question); ids.add(question.id);
    }
    index++;
  }
  return selected;
}
