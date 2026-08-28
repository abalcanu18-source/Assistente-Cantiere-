import db, { newId } from '../db.js';

// Cantieri e mezzi in Admin sono opzionali: se l'azienda non li fornisce in
// anticipo, l'operaio può comunque nominare a voce un cantiere/mezzo
// qualsiasi. In quel caso non esiste un record in db.data.jobsites/vehicles
// con un id, ma il nome detto dall'operaio viene comunque salvato nella
// sessione (jobsiteName/vehicleName) e va mostrato ovunque allo stesso modo
// di un cantiere "ufficiale".

export function resolveJobsite(session) {
  const jobsite = db.data.jobsites.find((j) => j.id === session.jobsiteId) || null;
  if (jobsite) return jobsite;
  if (session.jobsiteName) return { id: null, name: session.jobsiteName, address: '' };
  return null;
}

export function resolveVehicle(session) {
  const vehicle = db.data.vehicles.find((v) => v.id === session.vehicleId) || null;
  if (vehicle) return vehicle;
  if (session.vehicleName) return { id: null, name: session.vehicleName };
  return null;
}

export function enrichSession(session) {
  return { ...session, jobsite: resolveJobsite(session), vehicle: resolveVehicle(session) };
}

// Called every time an operator says a jobsite/vehicle name out loud. If it
// already exists (same name, case-insensitive), reuses it; otherwise creates
// it on the fly so it appears from now on in the Admin panel too, and gets
// recognized automatically the next time someone mentions it. This is what
// lets the whole app work with zero setup: nobody needs to pre-fill any list.
export function findOrCreateJobsite(name) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = db.data.jobsites.find((j) => j.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const jobsite = { id: newId(), name: trimmed, address: '' };
  db.data.jobsites.push(jobsite);
  return jobsite;
}

export function findOrCreateVehicle(name) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = db.data.vehicles.find((v) => v.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const vehicle = { id: newId(), name: trimmed, plate: '', type: '' };
  db.data.vehicles.push(vehicle);
  return vehicle;
}
