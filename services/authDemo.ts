import { dataService } from './mockDb';
import { User, Trip, VisitedItem } from '../types';

/**
 * "Auto-Setup & Demo Run": the server creates (or reuses) a demo account and returns a session; in dev
 * localStorage mode the demo is seeded locally. Shared by both sign-in pages. Throws when no user can be started.
 */
export const startDemo = async (): Promise<User> => {
    const serverDemoUser = await dataService.demoLogin();
    if (serverDemoUser) return serverDemoUser;
    // Dev localStorage mode (no server): seed the demo locally.
    const allUsers = await dataService.getUsers();
    let user: User | null = null;
    
    if (allUsers.length === 0) {
        // Create an Admin user as initial enrollment on blank slate
        user = await dataService.register('Admin User', 'admin@wandergrid.app', 'password', 'Admin');
    } else {
        // Prefer admin user from existing/restored users
        const targetUser = allUsers.find(u => u.email === 'admin@wandergrid.app')
            || allUsers.find(u => u.role === 'Admin')
            || allUsers[0];
        try {
            user = await dataService.login(targetUser.email || '', targetUser.password || 'password');
        } catch {
            user = targetUser;
        }
        if (!user) {
            user = targetUser;
        }
    }
    
    if (user) {
        // If the database has zero trips, seed an initial illustrative expedition dataset so routes, scratch map, and 3D globe are populated
        const existingTrips = await dataService.getTrips();
        if (existingTrips.length === 0) {
            const sampleTrips: Trip[] = [
                {
                    id: 'trip-demo-euro-asia',
                    name: 'Grand Intercontinental Expedition',
                    location: 'Paris, France',
                    startDate: '2025-06-01',
                    endDate: '2025-06-25',
                    status: 'Upcoming',
                    privacy: 'Public',
                    participants: [user.id || 'admin-1'],
                    transports: [
                        {
                            id: 'tr-demo-1',
                            itineraryId: 'itin-demo-1',
                            type: 'One-Way',
                            mode: 'Flight',
                            provider: 'Air France',
                            identifier: 'AF007',
                            confirmationCode: 'AF7XYZ',
                            origin: 'JFK',
                            destination: 'CDG',
                            originLat: 40.6413,
                            originLng: -73.7781,
                            destLat: 49.0097,
                            destLng: 2.5479,
                            departureDate: '2025-06-01',
                            departureTime: '18:30',
                            arrivalDate: '2025-06-02',
                            arrivalTime: '08:00',
                            travelClass: 'Business'
                        },
                        {
                            id: 'tr-demo-2',
                            itineraryId: 'itin-demo-2',
                            type: 'One-Way',
                            mode: 'Train',
                            provider: 'Eurostar',
                            identifier: 'ES9310',
                            confirmationCode: 'EST931',
                            origin: 'Paris',
                            destination: 'Amsterdam',
                            originLat: 48.8566,
                            originLng: 2.3522,
                            destLat: 52.3676,
                            destLng: 4.9041,
                            departureDate: '2025-06-06',
                            departureTime: '10:20',
                            arrivalDate: '2025-06-06',
                            arrivalTime: '13:45',
                            travelClass: 'First'
                        },
                        {
                            id: 'tr-demo-3',
                            itineraryId: 'itin-demo-3',
                            type: 'One-Way',
                            mode: 'Flight',
                            provider: 'KLM',
                            identifier: 'KL861',
                            confirmationCode: 'KLM861',
                            origin: 'AMS',
                            destination: 'NRT',
                            originLat: 52.3105,
                            originLng: 4.7683,
                            destLat: 35.7720,
                            destLng: 140.3929,
                            departureDate: '2025-06-12',
                            departureTime: '14:40',
                            arrivalDate: '2025-06-13',
                            arrivalTime: '08:50',
                            travelClass: 'Economy'
                        }
                    ]
                }
            ];
            for (const trip of sampleTrips) {
                await dataService.addTrip(trip);
            }
            const sampleVisited: VisitedItem[] = [
                { id: 'country_US', type: 'country', code: 'US', name: 'United States', residenceStatus: 'lived_current' },
                { id: 'country_FR', type: 'country', code: 'FR', name: 'France', residenceStatus: 'visited' },
                { id: 'country_NL', type: 'country', code: 'NL', name: 'Netherlands', residenceStatus: 'visited' },
                { id: 'country_JP', type: 'country', code: 'JP', name: 'Japan', residenceStatus: 'visited' },
                { id: 'country_GB-ENG', type: 'country', code: 'GB-ENG', name: 'England', residenceStatus: 'lived_past' }
            ];
            for (const v of sampleVisited) {
                await dataService.addVisited(v);
            }
        }
        return user;
    }
    throw new Error('Could not start the demo. Please try again.');
};
