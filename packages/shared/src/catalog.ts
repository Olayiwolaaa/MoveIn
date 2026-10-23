export const PROPERTY_TYPES = [
  { id: 'SINGLE_ROOM', label: 'Single room' },
  { id: 'SELF_CONTAIN', label: 'Self-contain' },
  { id: 'ROOM_AND_PARLOUR', label: 'Room and parlour' },
  { id: 'MINI_FLAT', label: 'Mini flat' },
  { id: 'FLAT', label: 'Flat' },
  { id: 'HOSTEL_ROOM', label: 'Hostel room' },
] as const;

export type PropertyTypeId = (typeof PROPERTY_TYPES)[number]['id'];

export const AMENITIES = [
  { id: 'PREPAID_METER', label: 'Prepaid meter' },
  { id: 'WATER', label: 'Borehole / running water' },
  { id: 'FENCED', label: 'Fenced / gated' },
  { id: 'SECURITY', label: 'Security' },
  { id: 'TILED', label: 'Tiled floors' },
  { id: 'WARDROBE', label: 'Wardrobe' },
  { id: 'POP_CEILING', label: 'POP ceiling' },
  { id: 'BACKUP_POWER', label: 'Generator or solar' },
  { id: 'PARKING', label: 'Parking' },
  { id: 'WIFI', label: 'Wi-Fi' },
] as const;

export type AmenityId = (typeof AMENITIES)[number]['id'];
