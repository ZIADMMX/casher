import { PLATE_KINDS, splitPlate } from '../../utils/vehicles.js';

/** An Egyptian-style number plate: letters | digits on a white plate, with a colour bar for the governorate or body. */
export default function VehiclePlate({ plate, city, kind = 'private' }) {
  const { letters, digits } = splitPlate(plate);
  const tone = (PLATE_KINDS[kind] || PLATE_KINDS.private).tone;
  return (
    <span className={`veh-plate is-${tone}`} role="img" aria-label={`لوحة ${letters} ${digits}`}>
      <span className="veh-plate__num"><b>{letters}</b><i aria-hidden="true" /><b>{digits}</b></span>
      <span className="veh-plate__bar">{city || PLATE_KINDS[kind]?.city || 'مصر'}</span>
    </span>
  );
}
