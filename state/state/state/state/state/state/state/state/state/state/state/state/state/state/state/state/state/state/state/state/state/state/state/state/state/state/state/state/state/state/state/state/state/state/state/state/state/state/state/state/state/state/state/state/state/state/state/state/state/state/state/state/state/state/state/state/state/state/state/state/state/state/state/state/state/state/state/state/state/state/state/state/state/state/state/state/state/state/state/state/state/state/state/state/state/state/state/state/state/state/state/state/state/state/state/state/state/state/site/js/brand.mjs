// Everything nameable, in one place. Renaming the product or a feature means editing
// here and nowhere else.
export const BRAND = {
  name: 'Astrolabe',
  wordmark: 'ASTROLABE',
  suffix: 'News',

  // What the product does, in its own words.
  tagline: 'Know who is covering a story, and who is not.',
  promo: 'Free to read. No account, no paywall, nothing tracked.',
  promoCta: 'See what you are missing',

  // The signature feed. In an eclipse the umbra is the deepest part of the shadow, where
  // the light source is hidden completely - which is the thing this measures.
  // Swap these three strings to rename the feature everywhere.
  gap: {
    name: 'Umbra',
    wordmark: 'UMBRA',
    blurb: 'Political stories that one side of the spectrum has left in shadow.',
    // Column headings on the feed page.
    left: 'Missed by the Left',
    right: 'Missed by the Right',
    leftSub: 'Stories the Left is barely reporting.',
    rightSub: 'Stories the Right is barely reporting.'
  },

  // Other feature names.
  compare: 'Side by Side',      // per-side summaries of one story
  reading: 'Your Balance',      // the personal reading report
  digest: 'The Rundown',        // the daily digest
  unrated: 'Unrated sources'    // outlets with no bias rating
};

export const titled = (page) => (page ? `${page} — ${BRAND.name}` : BRAND.name);
