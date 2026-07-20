import { PortfolioProvider } from './context/PortfolioContext';
import { Layout } from './components/Layout';

function App() {
  return (
    <PortfolioProvider>
      <Layout />
    </PortfolioProvider>
  );
}

export default App;
