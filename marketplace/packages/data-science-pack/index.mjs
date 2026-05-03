// data-science-pack/index.mjs
//
// Full data science bundle for SamCode.
// Combines notebook core, pandas/numpy, and visualization tools.

export async function activate(context) {
  const { packageRecord } = context

  console.log(`Activating Data Science Pack: ${packageRecord.name}`)

  return {
    type: 'data-science-bundle',
    id: packageRecord.id,
    name: packageRecord.name,
    version: packageRecord.version,
    runtime: packageRecord.runtime,
    features: packageRecord.features,
    ui: packageRecord.ui,
    activateTime: new Date().toISOString(),
    provideVisualizationTemplates: () => {
      return [
        {
          label: 'Line Chart',
          code: 'df.plot(kind="line", x="date", y="value")'
        },
        {
          label: 'Bar Chart',
          code: 'df.plot(kind="bar", x="category", y="amount")'
        },
        {
          label: 'Histogram',
          code: 'df["values"].hist(bins=20)'
        }
      ]
    },
    provideModelTools: () => {
      return [
        {
          label: 'Linear Regression',
          code: 'from sklearn.linear_model import LinearRegression\nmodel = LinearRegression()'
        },
        {
          label: 'Train/Test Split',
          code: 'from sklearn.model_selection import train_test_split\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)'
        }
      ]
    }
  }
}
