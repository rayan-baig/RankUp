/**
 * Chart colours.
 *
 * The Blueprint report deliberately draws its charts on a neutral surface
 * instead of the parent's theme colours — a chart has to stay readable and
 * colour-blind safe whichever of the 10 dashboard themes is active, and it
 * cannot do that if its series colours shift with the skin.
 *
 * These exact values were checked with a colour-blindness / contrast validator
 * for both light and dark surfaces before being used.
 */

export const CHART = {
  light: {
    surface: '#fcfcfb',
    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    grid: '#e4e3df',
    series: ['#2a78d6', '#eb6834', '#1baf7a'],
  },
  dark: {
    surface: '#1a1a19',
    textPrimary: '#ffffff',
    textSecondary: '#c3c2b7',
    grid: '#333331',
    series: ['#3987e5', '#d95926', '#199e70'],
  },
}

export function chartTokens(mode) {
  return CHART[mode === 'light' ? 'light' : 'dark']
}
