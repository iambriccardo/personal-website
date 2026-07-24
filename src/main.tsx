import { createRoot } from 'react-dom/client'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource/bodoni-moda/latin-700.css'
import './styles.css'
import App from './App'

const root = document.getElementById('root')!

// Production HTML contains meaningful crawlable/no-JavaScript content.
// The interactive application replaces that fallback once JavaScript starts.
root.replaceChildren()

createRoot(root).render(
  <App />,
)
