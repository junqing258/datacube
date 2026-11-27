export const demoEmail = 'demo@datacube.local';

export function demoLoginConfig() {
  if (process.env.DEMO_LOGIN_ENABLED !== 'true') return null;
  const password = process.env.DEMO_LOGIN_PASSWORD;
  if (!password || password.length < 8 || password.length > 128) {
    throw new Error('DEMO_LOGIN_PASSWORD 须为 8 至 128 个字符。');
  }
  return { email: demoEmail, password };
}
