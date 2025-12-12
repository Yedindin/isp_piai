import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import SignIn from '@/pages/SignIn';
import MainPage from '@/pages/MainPage';
import PendingPage from '@/pages/PendingPage';
import ProtectedRoute from '@/lib/ProtectedRoute';
import { AuthProvider } from '@/lib/auth';

const Router = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 공개 라우트 */}
          <Route path="/sign-in" element={<SignIn />} />

          {/* 보호 라우트 묶음 */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<MainPage />} />
            <Route path="/main" element={<MainPage />} />
            <Route path="/pending" element={<PendingPage />} />
          </Route>

          {/* 나머지는 홈으로 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default Router;
