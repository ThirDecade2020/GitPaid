import '../styles/global.css';
import Layout from '../components/Layout';
import { useEffect, useState } from 'react';

function MyApp({ Component, pageProps }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <Layout>
      {isMounted ? <Component {...pageProps} /> : null}
    </Layout>
  );
}

export default MyApp;
