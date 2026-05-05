export async function activate(context = {}) {
  return {
    packageId: context.packageId || 'java-language',
    enabled: true,
    features: ['java snippets', 'lightweight formatting', 'editor helper activation']
  }
}
