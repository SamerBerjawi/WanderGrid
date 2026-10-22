import type { Accommodation } from '../../../types';
import { Bed, Buildings, House, Mountains, Users, type Icon } from '../../ui/hugeicons';

/** The icon for a stay with no logo, by its type (a bed unless it is a home, flat, campsite or family). */
const BY_TYPE: Record<Accommodation['type'], Icon> = {
    Hotel: Bed,
    Resort: Bed,
    Hostel: Bed,
    Airbnb: House,
    Villa: House,
    Apartment: Buildings,
    Campground: Mountains,
    'Friends/Family': Users,
};

export const stayIcon = (type?: Accommodation['type']): Icon => (type && BY_TYPE[type]) || Bed;
