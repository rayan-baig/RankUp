import { useApp } from '../state/AppContext.jsx'

/**
 * "This phone's storage is full."
 *
 * Saving used to fail in silence: a full phone kept working on screen, and
 * everything done since the last good save was gone the next time the app
 * opened, with nothing to say so. Now the person is told, plainly, while the
 * app carries on — what is on screen stays, changes still go to the server
 * when they can be queued, and saving is tried again on every change, so the
 * banner goes away on its own once there is room.
 */
export default function StorageFullBanner() {
  const { storageFull } = useApp()
  if (!storageFull) return null
  return (
    <div
      role="alert"
      data-testid="storage-full"
      className="sticky top-0 z-30 px-3 py-2 text-xs"
      style={{
        background: 'color-mix(in srgb, var(--warn) 18%, var(--bg))',
        borderBottom: '1px solid color-mix(in srgb, var(--warn) 45%, transparent)',
      }}
    >
      <strong>This phone&apos;s storage is full.</strong> RankUp is still working, but it cannot save
      on this phone until there is room. Keep the app open and free up some space on the phone;
      anything waiting to send still goes when it can.
    </div>
  )
}
