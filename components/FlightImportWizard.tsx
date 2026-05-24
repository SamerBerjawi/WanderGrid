import React, { useRef, useState } from 'react';
import { Trip, Transport, User } from '../types';
import { Button } from './ui';
import { flightImporter } from '../services/flightImportExport';
import { dataService } from '../services/mockDb';

interface FlightImportWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: (trips: Trip[]) => void;
    users?: User[];
    existingTripId?: string;
}

export const FlightImportWizard: React.FC<FlightImportWizardProps> = ({
    isOpen,
    onClose,
    onImportComplete,
    users = [],
    existingTripId
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<1 | 2>(1);
    const [fileName, setFileName] = useState('');
    const [parsedTransports, setParsedTransports] = useState<Transport[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '');

    if (!isOpen) return null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        try {
            const transports = await flightImporter.parseFile(file);
            setParsedTransports(transports);
            setStep(2);
        } catch (error) {
            console.error(error);
            alert("Failed to read the file. Please ensure it follows the correct CSV/Excel format.");
        }
        
        // Reset file input so we can upload the same file again if needed
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleProcessAndSave = async () => {
        const targetTripId = existingTripId;
        const targetUser = selectedUserId || 'user_holder';
        
        setIsProcessing(true);
        try {
            if (targetTripId) {
                // Append logic
                const trip = await dataService.getTripById(targetTripId);
                if (trip) {
                    const currentTransports = trip.transports || [];
                    const mergedTransports = [...currentTransports, ...parsedTransports.map(leg => ({
                        ...leg,
                        itineraryId: currentTransports[0]?.itineraryId || Math.random().toString(36).substr(2, 9),
                        type: trip.transports?.length ? trip.transports[0].type : 'Multi-City'
                    }))];

                    const updatedTrip: Trip = {
                        ...trip,
                        transports: mergedTransports,
                        startDate: mergedTransports[0]?.departureDate || trip.startDate,
                        endDate: mergedTransports[mergedTransports.length - 1]?.arrivalDate || mergedTransports[mergedTransports.length - 1]?.departureDate || trip.endDate,
                    };
                    await dataService.updateTrip(updatedTrip);
                    onImportComplete([updatedTrip]);
                }
            } else {
                // Group logic
                const trips = flightImporter.groupTransportsIntoTrips(parsedTransports, targetUser);
                await dataService.addTrips(trips);
                onImportComplete(trips);
            }
            onClose();
        } catch (e) {
            console.error('Import error', e);
            alert('An error occurred while saving imported data.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/70 backdrop-blur-md flex items-center justify-center z-[9000] p-4 text-slate-800 dark:text-slate-200">
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-xl flex flex-col w-full max-w-3xl overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50 dark:bg-zinc-800">
                    <h3 className="text-xl font-bold">Import Flights</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-full">
                        <span className="material-icons-outlined">close</span>
                    </button>
                </div>
                
                <div className="p-8 pb-12 flex-1 overflow-y-auto max-h-[70vh]">
                    {step === 1 && (
                        <div className="text-center space-y-6">
                            <h4 className="text-lg font-semibold">Upload flight records (CSV or Excel)</h4>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-300 dark:border-zinc-700 hover:border-blue-500 rounded-2xl p-16 cursor-pointer bg-gray-50 dark:bg-zinc-800/50 group transition-all"
                            >
                                <span className="material-icons-outlined text-4xl text-blue-500 mb-4 group-hover:-translate-y-1 transition-transform">upload_file</span>
                                <p className="font-medium">Click to select CSV or XLSX file</p>
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 p-4 rounded-xl font-medium border border-emerald-200 dark:border-emerald-800">
                                Successfully parsed {parsedTransports.length} flights from {fileName}
                            </div>
                            
                            {!existingTripId && users.length > 0 && (
                                <div className="space-y-2 pt-4">
                                    <label className="text-sm font-bold opacity-80 uppercase tracking-widest">Assign to User</label>
                                    <select
                                        value={selectedUserId}
                                        onChange={(e) => setSelectedUserId(e.target.value)}
                                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 outline-none focus:border-blue-500"
                                    >
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex gap-4 pt-6">
                                <Button variant="secondary" onClick={() => setStep(1)} className="flex-1 font-bold">Back</Button>
                                <Button variant="primary" onClick={handleProcessAndSave} className="flex-1 font-bold" disabled={isProcessing}>
                                    {isProcessing ? 'Processing...' : 'Confirm Import'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
