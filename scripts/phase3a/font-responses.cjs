// next/font's test hook: offline font CSS only for isolated validation, never application config.
module.exports = new Proxy({}, { get(_target, url) {
  if (typeof url !== 'string' || !url.startsWith('https://fonts.googleapis.com/')) return undefined;
  const family = new URL(url).searchParams.get('family')?.split(':')[0];
  if (!family || !/^[a-zA-Z ]+$/.test(family)) throw new Error('Unexpected local font fixture.');
  return `@font-face { font-family: '${family}'; src: local('Arial'); font-weight: 100 900; font-style: normal; }`;
} });
