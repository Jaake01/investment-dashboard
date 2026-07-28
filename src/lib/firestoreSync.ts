import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Holding, Snapshot, SyncableSettings } from '../types';

// Firestore's hard limit per writeBatch().
const BATCH_LIMIT = 500;

function holdingsCollection(uid: string) {
  return collection(db, 'users', uid, 'holdings');
}
function snapshotsCollection(uid: string) {
  return collection(db, 'users', uid, 'snapshots');
}
function settingsDocRef(uid: string) {
  return doc(db, 'users', uid, 'settings', 'main');
}

export interface DocChange<T> {
  id: string;
  // null means the doc was deleted.
  data: T | null;
  // true if this change is the echo of a write this same client just made
  // (Firestore's optimistic local update, not yet server-acked) — the
  // caller already has this change reflected locally, so it should skip
  // re-applying it to avoid a write -> listener -> write loop.
  isLocalEcho: boolean;
}

function subscribeCollection<T extends DocumentData>(
  uid: string,
  collectionFn: (uid: string) => ReturnType<typeof collection>,
  cb: (changes: DocChange<T>[]) => void,
): Unsubscribe {
  return onSnapshot(collectionFn(uid), (snap) => {
    const changes = snap.docChanges().map((change) => ({
      id: change.doc.id,
      data: change.type === 'removed' ? null : (change.doc.data() as T),
      isLocalEcho: change.doc.metadata.hasPendingWrites,
    }));
    if (changes.length > 0) cb(changes);
  });
}

export function subscribeHoldings(uid: string, cb: (changes: DocChange<Holding>[]) => void): Unsubscribe {
  return subscribeCollection<Holding>(uid, holdingsCollection, cb);
}

export function subscribeSnapshots(uid: string, cb: (changes: DocChange<Snapshot>[]) => void): Unsubscribe {
  return subscribeCollection<Snapshot>(uid, snapshotsCollection, cb);
}

export function subscribeSettings(
  uid: string,
  cb: (data: SyncableSettings | null, isLocalEcho: boolean) => void,
): Unsubscribe {
  return onSnapshot(settingsDocRef(uid), (snap) => {
    cb(snap.exists() ? (snap.data() as SyncableSettings) : null, snap.metadata.hasPendingWrites);
  });
}

export async function writeHolding(uid: string, holding: Holding): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'holdings', holding.id), holding);
}

export async function deleteHoldingDoc(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'holdings', id));
}

export async function writeSettingsDoc(uid: string, settings: SyncableSettings): Promise<void> {
  await setDoc(settingsDocRef(uid), settings);
}

export async function writeSnapshotDoc(uid: string, snapshot: Snapshot): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'snapshots', snapshot.date), snapshot);
}

async function batchUpsert<T extends { }>(
  uid: string,
  items: T[],
  docIdFor: (item: T) => string,
  subcollection: 'holdings' | 'snapshots',
): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + BATCH_LIMIT);
    for (const item of chunk) {
      batch.set(doc(db, 'users', uid, subcollection, docIdFor(item)), item);
    }
    await batch.commit();
  }
}

export function batchUpsertHoldings(uid: string, holdings: Holding[]): Promise<void> {
  return batchUpsert(uid, holdings, (h) => h.id, 'holdings');
}

export function batchUpsertSnapshots(uid: string, snapshots: Snapshot[]): Promise<void> {
  return batchUpsert(uid, snapshots, (s) => s.date, 'snapshots');
}

export async function deleteHoldingDocsBatch(uid: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = ids.slice(i, i + BATCH_LIMIT);
    for (const id of chunk) batch.delete(doc(db, 'users', uid, 'holdings', id));
    await batch.commit();
  }
}
