import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { transport, freshAccessToken } from '../lib/sync/transport.js'
import { clearState } from '../lib/storage.js'
import { Card, Button, Banner, SectionTitle, Modal, TextInput, Field } from './ui.jsx'
import { navigate } from '../lib/router.js'
import { humanError } from '../lib/errors.js'
import { familySummaryHtml } from '../lib/dataExport.js'

const DELETE_URL = import.meta.env?.VITE_DELETE_ACCOUNT_URL || '/api/delete-account'

/**
 * Delete the account through the server, which also cancels the family's
 * Stripe subscription there and then, with the secret key a browser must never
 * hold. Calling the database directly deleted the family and left the card
 * being charged every month.
 *
 * Where there is no server function to ask (a host serving only the app, or
 * the development server) the database is asked directly, as before: the
 * account still goes at once, and the cancellation it queues is made by the
 * daily retention job.
 */
async function deleteOnServer() {
  const token = await freshAccessToken()
  if (token) {
    try {
      const res = await fetch(DELETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })
      const data = await res.json().catch(() => null)
      // The endpoint's own answer, deleted or refused. Anything else (a page
      // instead of JSON, "not configured") means it is not there to ask.
      if (data && typeof data.ok === 'boolean') return data
    } catch {
      // Not reachable: ask the database instead.
    }
  }
  return transport.rpc('delete_family_account', { p_confirm: 'DELETE' })
}

/**
 * The rights a parent actually has, as buttons rather than as paragraphs.
 *
 * A privacy policy that says "you may request deletion by writing to us" is
 * technically compliant and practically useless. These do the thing.
 */
export default function DataRights() {
  const { state, dispatch } = useApp()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const [typed, setTyped] = useState('')
  // The two files of the last download, kept so either can be saved again
  // if the phone stopped the second one.
  const [files, setFiles] = useState([])

  /** Everything held about this family, as a file they can keep. */
  const download = async () => {
    setBusy(true)
    setNote('')
    let payload
    if (transport.isConfigured()) {
      try {
        payload = await transport.rpc('export_family_data', {})
      } catch (err) {
        setNote(humanError(err, 'Could not reach the server. Try again in a moment.'))
        setBusy(false)
        return
      }
    } else {
      // Device-only build: the local state IS everything held.
      payload = { exported_at: new Date().toISOString(), source: 'this device only', ...state }
    }

    /*
     * Two files: the JSON, which is everything, and a page anyone can read,
     * made here from that same JSON, so it cannot hold anything the JSON
     * does not (lib/dataExport.js).
     */
    const day = new Date().toISOString().slice(0, 10)
    files.forEach((f) => URL.revokeObjectURL(f.url))
    const made = [
      { name: `rankup-data-${day}.json`, label: 'Everything (JSON)', blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }) },
      { name: `rankup-summary-${day}.html`, label: 'Easy to read (opens in a browser)', blob: new Blob([familySummaryHtml(payload)], { type: 'text/html' }) },
    ].map((f) => ({ ...f, url: URL.createObjectURL(f.blob) }))
    for (const f of made) {
      const a = document.createElement('a')
      a.href = f.url
      a.download = f.name
      a.click()
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 400))
    }
    setFiles(made)
    setNote('Downloaded two files: everything as JSON, and an easy-to-read summary.')
    setBusy(false)
  }

  const withdraw = async () => {
    setBusy(true)
    if (transport.isConfigured()) {
      try { await transport.rpc('revoke_parental_consent', { p_reason: 'Withdrawn in Settings' }) }
      catch { /* the local wipe below still happens */ }
    }
    clearState()
    dispatch({ type: 'RESET' })
    window.location.hash = '/'
    window.location.reload()
  }

  const deleteAccount = async () => {
    if (typed !== 'DELETE') return
    setBusy(true)
    // The look-around family is nobody's: deleting it deletes nothing on a
    // server, and must not sign out an account this phone may also hold.
    if (transport.isConfigured() && !state.demo) {
      try { await deleteOnServer() }
      catch { /* the local wipe below still happens */ }
      transport.signOut()
    }
    clearState()
    dispatch({ type: 'RESET' })
    window.location.hash = '/'
    window.location.reload()
  }

  return (
    <>
      <SectionTitle>Your data</SectionTitle>
      <Card className="mb-4">
        <p className="text-sm text-muted mb-3">
          You can see everything held about your family, and delete it, whenever you want. No
          email, no waiting.
        </p>

        <Banner tone="good" icon="📸" title="No photos, ever">
          RankUp never takes, sends or keeps a photo. If your child shows you a picture, it comes
          from their own camera app, by message, and stays there.
        </Banner>

        <Button variant="soft" className="w-full mb-2" disabled={busy} onClick={download}>
          ⬇ Download my data
        </Button>
        {note && <p className="text-xs text-muted mb-2" role="status">{note}</p>}
        {files.length > 0 && (
          <ul className="text-xs mb-2 space-y-1" data-testid="download-files">
            {files.map((f) => (
              <li key={f.name}>
                <a className="underline" href={f.url} download={f.name}>{f.label}</a>
                <span className="text-muted"> · {f.name}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1 text-sm" onClick={() => navigate('/legal/privacy')}>
            Privacy policy
          </Button>
          <Button variant="ghost" className="flex-1 text-sm" onClick={() => navigate('/legal/terms')}>
            Terms
          </Button>
        </div>
      </Card>

      <SectionTitle>Ending it</SectionTitle>
      <Card className="mb-4" style={{ borderColor: 'var(--bad)' }}>
        <Banner tone="warn" icon="⚠️" title="Both of these are immediate and permanent">
          There is no undo and no grace period. That is deliberate — a deletion that is not really
          a deletion is worse than none.
        </Banner>
        <div className="mt-3 space-y-2">
          <Button variant="soft" className="w-full" onClick={() => setConfirmWithdraw(true)}>
            Withdraw my consent
          </Button>
          <Button variant="danger" className="w-full" onClick={() => { setTyped(''); setConfirmDelete(true) }}>
            Delete my account
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmWithdraw}
        onClose={() => setConfirmWithdraw(false)}
        title="Withdraw consent?"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmWithdraw(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" disabled={busy} onClick={withdraw}>Withdraw</Button>
          </>
        }
      >
        <p className="text-sm">
          Withdrawing consent deletes your children's profiles, quests and progress. Your
          own account stays, but you will not be able to add a child again without consenting
          afresh. A paid plan carries on until you cancel it on your plan page (Manage billing), or
          delete the account.
        </p>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete everything?"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" disabled={typed !== 'DELETE' || busy} onClick={deleteAccount}>
              Delete for ever
            </Button>
          </>
        }
      >
        <p className="text-sm mb-3">
          This removes your account, every child profile, every quest and all
          progress. It cannot be undone. If you pay for a plan, the subscription
          is cancelled at the same moment, so nothing more is charged.
        </p>
        <Field label="Type DELETE to confirm">
          <TextInput value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} placeholder="DELETE" />
        </Field>
      </Modal>
    </>
  )
}
