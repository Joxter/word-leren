import { css } from '@linaria/core'

const container = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
`

function App() {
  return (
    <div className={container}>
      <h1>Word Leren</h1>
    </div>
  )
}

export default App
