// 天气查询模块 — 用 wttr.in 免费 API，无需 key

/**
 * Get weather for a city, return a brief Chinese description.
 * @param {string} city - city name, e.g. "Chengdu"
 * @returns {string} weather description suitable for prompting AI
 */
export async function getWeather(city = 'Chengdu') {
  try {
    // wttr.in format=3 gives a one-liner like "Chengdu: ☀️ +25°C"
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=3&lang=zh`,
      { timeout: 5000 }
    );
    if (!res.ok) return null;
    const text = await res.text();
    const clean = text.trim();
    // Fallback if API returns empty
    if (!clean) return null;
    return clean;
  } catch (e) {
    console.error('[Weather] Fetch failed:', e.message);
    return null;
  }
}

/**
 * Get detailed weather forecast for prompting AI.
 */
export async function getWeatherDetail(city = 'Chengdu') {
  try {
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=4&lang=zh`,
      { timeout: 5000 }
    );
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}
