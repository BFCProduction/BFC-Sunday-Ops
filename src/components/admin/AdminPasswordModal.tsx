import { useState } from 'react'
import { Lock, X } from 'lucide-react'
import { useAdmin } from '../../context/adminState'

interface Props {
  onClose: () => void
}

export function AdminPasswordModal({ onClose }: Props) {
  const { login } = useAdmin()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    const ok = await login(password)
    setSubmitting(false)
    if (ok) {
      onClose()
    } else {
      setError(true)
      setPassword('')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-700" />
            <h3 className="text-gray-900 font-bold">Admin Access</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-500 text-sm mb-4">Enter the admin password to enable checklist editing.</p>
        <input
          autoFocus
          type="password"
          className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:border-blue-500 ${error ? 'border-red-400' : 'border-gray-200'}`}
          placeholder="Password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(false) }}
          onKeyDown={e => e.key === 'Enter' && void handleSubmit()}
        />
        {error && <p className="text-red-500 text-xs mt-1.5">Incorrect password</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={() => void handleSubmit()} disabled={submitting}
            className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-60">
            {submitting ? 'Checking...' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  )
}
