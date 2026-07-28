import { AuthProvider } from './context/AuthContext';
import { PortfolioProvider } from './context/PortfolioContext';
import { Layout } from './components/Layout';

function App() {
  return (
    <AuthProvider>
      <PortfolioProvider>
        <Layout />
      </PortfolioProvider>
    </AuthProvider>
  );
}

export default App;
