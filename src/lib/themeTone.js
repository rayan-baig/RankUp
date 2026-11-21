/**
 * Is a world light (a pale background with dark words) or dark?
 *
 * From the relative luminance of the theme's background colour. HeroArt
 * uses it to keep the night skyline off the light worlds.
 */
export function isLightTheme(theme) {
  const hex = String(theme?.colors?.bg || '').replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
}
