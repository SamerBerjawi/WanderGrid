import React from 'react';
import { NewTripDrawer, NewTripDrawerProps } from './NewTripDrawer';
import { TripSetupBoard } from './TripSetupBoard';

/**
 * TripModal delegates new trip creation to TripSetupBoard,
 * and trip settings editing to NewTripDrawer.
 */
export type TripModalProps = NewTripDrawerProps;
export const TripModal: React.FC<NewTripDrawerProps> = (props) => {
    if (!props.initialData) {
        return (
            <TripSetupBoard
                isOpen={props.isOpen}
                initialStatus={props.initialStatus}
                users={props.users}
                onClose={props.onClose}
                onTripCreated={(newTrip) => {
                    if (props.onSubmit) props.onSubmit(newTrip);
                    props.onClose();
                }}
            />
        );
    }
    return <NewTripDrawer {...props} />;
};

export default TripModal;
