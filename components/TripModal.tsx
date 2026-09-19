import React from 'react';
import { NewTripDrawer, NewTripDrawerProps } from './NewTripDrawer';

/**
 * TripModal has been deprecated and unified into NewTripDrawer.
 * Both New Trip creation and Trip Edit Settings now point to the Liquid Glass NewTripDrawer.
 */
export type TripModalProps = NewTripDrawerProps;
export const TripModal: React.FC<NewTripDrawerProps> = (props) => {
    return <NewTripDrawer {...props} />;
};

export default TripModal;
