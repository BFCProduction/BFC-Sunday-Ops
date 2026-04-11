import bfcLogo from '../../assets/BFC_Production_Logo_Hor reverse.png'

interface Props {
  onLogin: () => void
  error?:  string | null
}

export function LoginScreen({ onLogin, error }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: '#111827' }}>

      {/* Logo */}
      <img
        src={bfcLogo}
        alt="BFC Production"
        className="h-10 w-auto object-contain mb-10 opacity-90"
      />

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-8 py-8">
          <h1 className="text-gray-900 text-xl font-bold mb-1">Sunday Ops</h1>
          <p className="text-gray-500 text-sm mb-8">
            Sign in with your Planning Center account to continue.
          </p>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={onLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5
                       bg-gray-900 hover:bg-gray-700 active:bg-gray-800
                       text-white text-sm font-semibold rounded-xl
                       transition-colors focus:outline-none focus:ring-2
                       focus:ring-offset-2 focus:ring-gray-900"
          >
            {/* PCO-style icon */}
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect width="40" height="40" rx="8" fill="white" fillOpacity="0.15" />
              <path
                d="M20 6C12.268 6 6 12.268 6 20s6.268 14 14 14 14-6.268 14-14S27.732 6 20 6zm0 4a10 10 0 110 20 10 10 0 010-20zm0 3a7 7 0 100 14A7 7 0 0020 13zm0 3a4 4 0 110 8 4 4 0 010-8z"
                fill="white"
              />
            </svg>
            Sign in with Planning Center
          </button>
        </div>

        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            Access is limited to BFC Production team members.
          </p>
        </div>
      </div>
    </div>
  )
}
