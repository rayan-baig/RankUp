import { useState } from 'react'
import { useApp } from '../state/AppContext.jsx'
import { transport } from '../lib/sync/transport.js'
import { clearState } from '../lib/storage.js'
import { Card, Button, Banner, SectionTitle, Modal, TextInput, Select, Field } from './ui.jsx'
import { navigate } from '../lib/router.js'

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
  const retention = state.settings.photoRetentionDays ?? 30

  /** Everything held about this family, as a file they can keep. */
  const download = async () => {
    setBusy(true)
    setNote('')
    let payload
    if (transport.isConfigured()) {
      try {
        payload = await transport.rpc('export_family_data', {})
      } catch (err) {
        setNote(`Could not reach the server: ${err.message}`)
        setBusy(false)
        return
      }
    } else {
      // Device-only build: the local state IS everything held.
      payload = { exported_at: new Date().toISOString(), source: 'this device only', ...state }
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rankup-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setNote('Downloaded.')
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
    if (transport.isConfigured()) {
      try { await transport.rpc('delete_family_account', { p_confirm: 'DELETE' }) }
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

        <Field
          label="Keep chore photos for"
          hint="Photos are deleted this long after you review them. Shorter is safer — you cannot leak what you no longer hold."
        >
          <Select
            value={retention}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_SETTINGS', patch: { photoRetentionDays: Number(e.target.value) } })
            }
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </Select>
        </Field>

        <Button variant="soft" className="w-full mb-2" disabled={busy} onClick={download}>
          ⬇ Download my data
        </Button>
        {note && <p className="text-xs text-muted mb-2">{note}</p>}

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
          Withdrawing consent deletes your children's profiles, quests, photos and progress. Your
          own account stays, but you will not be able to add a child again without consenting
          afresh.
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
          This removes your account, every child profile, every quest, every photo and all
          progress. It cannot be undone.
        </p>
        <Field label="Type DELETE to confirm">
          <TextInput value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} placeholder="DELETE" />
        </Field>
      </Modal>
    </>
  )
}
