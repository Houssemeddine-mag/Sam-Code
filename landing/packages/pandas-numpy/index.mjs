// pandas-numpy/index.mjs
//
// Data analysis package for SamCode.
// Extends the notebook core with pandas and numpy helpers and UI snippets.

export async function activate(context) {
  const { packageRecord } = context

  console.log(`Activating Pandas/NumPy package: ${packageRecord.name}`)

  return {
    type: 'data-analysis-extension',
    id: packageRecord.id,
    name: packageRecord.name,
    version: packageRecord.version,
    runtime: packageRecord.runtime,
    features: packageRecord.features,
    ui: packageRecord.ui,
    activateTime: new Date().toISOString(),
    provideSnippets: () => {
      return [
        {
          label: 'DataFrame from dict',
          code: 'pd.DataFrame({\n  "column1": [1, 2, 3],\n  "column2": ["A", "B", "C"]\n})'
        },
        {
          label: 'NumPy array',
          code: 'np.array([1, 2, 3, 4, 5])'
        },
        {
          label: 'Group by and aggregate',
          code: 'df.groupby("category").agg({"value": "mean"})'
        }
      ]
    },
    provideDataPreview: (filePath) => {
      // Simulate reading a CSV or Excel file
      return Promise.resolve({
        head: [
          ['Name', 'Age', 'City'],
          ['Alice', 30, 'New York'],
          ['Bob', 25, 'San Francisco']
        ],
        rowCount: 100,
        columnCount: 3
      })
    }
  }
}
