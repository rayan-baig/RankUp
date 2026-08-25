/**
 * Picks the pairing backend.
 *
 * With Supabase credentials set, pairing works between real devices. Without
 * them it falls back to the local adapter, which works only between tabs of the
 * same browser — enough to develop and demo against, and clearly labelled as
 * such everywhere it appears in the interface.
 */

import { localAdapter } from './localAdapter.js'
import { supabaseAdapter, isSupabaseConfigured } from './supabaseAdapter.js'

export const syncAdapter = isSupabaseConfigured() ? supabaseAdapter : localAdapter

/** True only when pairing can actually reach another device. */
export const canSyncAcrossDevices = syncAdapter.isReal

export { localAdapter, supabaseAdapter, isSupabaseConfigured }
