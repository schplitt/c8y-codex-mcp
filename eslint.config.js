import schplitt from '@schplitt/eslint-config'

export default schplitt({
  ignores: ['./.wrangler/**/*'],
  pnpm: false,
}).overrideRules({
  'eslint-comments/no-unlimited-disable': 'off',
  'no-undef': 'off',
})
