import React from 'react';
import { toast } from '../../../services/toast';
import { Copy, DownloadSimple, UploadSimple } from '../../ui/hugeicons';
import { RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * How to get a trip file: plan the trip with an AI assistant (ChatGPT, Claude, Gemini…), hand it the template, whose
 * "$comment" carries the format's rules for the assistant, and import its reply. docs/TRIP_INTERCHANGE.md.
 */

export const TEMPLATE_URL = '/samples/wandergrid-trip-template.json';
export const TEMPLATE_NAME = 'wandergrid-trip-template.json';

export const PLAN_PROMPT = `I'm planning a trip and want to import it into WanderGrid, my travel planner.

Trip: [where, dates, who is travelling (ages of any children), pace, interests, budget and currency, anything already booked].

First, plan the itinerary with me. When I'm happy with it, fill in the attached WanderGrid template (${TEMPLATE_NAME}) with the itinerary. Follow every rule in its "$comment" field, keep its structure, and don't invent times, prices, flight numbers or booking references. Reply with the JSON only.`;

export const REVISE_PROMPT = `Update the WanderGrid JSON with these changes: [your changes].
Keep trip.external_id and every existing id exactly the same, so WanderGrid updates my trip instead of making a copy. Reply with the complete JSON only.`;

const BTN = 'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-rp-muted';
const SMALL = 'inline-flex min-h-11 items-center gap-1.5 self-start rounded-full bg-rp-inset px-4 text-xs font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted';

const copy = async (text: string, what: string) => {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${what} copied`);
    } catch {
        toast.error("Couldn't copy. Select the text and copy it instead.");
    }
};

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
    <li className="flex gap-3">
        <span className="rp-tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-rp-ink text-xs font-semibold text-rp-on-ink" aria-hidden>{n}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
            <h3 className="text-sm font-medium text-rp-ink">{title}</h3>
            {children}
        </div>
    </li>
);

const Prompt: React.FC<{ text: string; label: string }> = ({ text, label }) => (
    <div className="flex flex-col gap-2">
        <pre aria-label={label} className="max-h-48 overflow-auto rounded-rp-inset bg-rp-inset px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-rp-ink">{text}</pre>
        <button type="button" onClick={() => void copy(text, label)} className={SMALL}><Copy size={14} aria-hidden /> Copy {label.toLowerCase()}</button>
    </div>
);

export const ItineraryAiGuide: React.FC<{ open: boolean; onClose: () => void; onImport?: () => void }> = ({ open, onClose, onImport }) => (
    <RpSheet
        open={open}
        onClose={onClose}
        title="Make a trip file with AI"
        subtitle="Plan with ChatGPT, Claude or any AI assistant, then import the result"
        width={520}
        footer={
            <>
                <button type="button" onClick={onClose} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Close</button>
                {onImport ? <button type="button" onClick={onImport} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><UploadSimple size={16} aria-hidden /> Import itinerary</button> : null}
            </>
        }
    >
        <div className="flex flex-col gap-5">
            <p className="text-sm text-rp-muted">
                An AI assistant can plan a whole trip with you: the days, what to see, where to stay, how to get around and a rough budget.
                WanderGrid's template tells it how to write that plan so it imports as a trip, with nothing marked as booked.
            </p>
            <ol className="flex flex-col gap-5">
                <Step n={1} title="Download the template">
                    <p className="text-xs text-rp-muted">A small example trip, with the rules for the assistant written into the file itself.</p>
                    <a href={TEMPLATE_URL} download={TEMPLATE_NAME} className={SMALL}><DownloadSimple size={14} aria-hidden /> Download {TEMPLATE_NAME}</a>
                </Step>
                <Step n={2} title="Plan the trip with your assistant">
                    <p className="text-xs text-rp-muted">Start a chat, attach the template (or paste its contents), and send this prompt with your trip filled in. Go back and forth until the plan suits you.</p>
                    <Prompt text={PLAN_PROMPT} label="Prompt" />
                </Step>
                <Step n={3} title="Get the JSON">
                    <p className="text-xs text-rp-muted">
                        Save the assistant's reply as a <code className="rounded bg-rp-inset px-1">.json</code> file, or just copy it: you can paste it into the importer,
                        even with the assistant's message or a code block around it.
                    </p>
                </Step>
                <Step n={4} title="Import it">
                    <p className="text-xs text-rp-muted">
                        Import itinerary checks the file and shows every day, stay, leg and budget line before anything is saved. Untick what you don't want,
                        read the Warnings tab, then create the trip. Hotels arrive as candidates and transport as not booked until you book them.
                    </p>
                </Step>
            </ol>
            <div className="flex flex-col gap-2 rounded-rp-tile bg-rp-inset/60 p-3">
                <h3 className="text-sm font-medium text-rp-ink">Changing the plan later</h3>
                <p className="text-xs text-rp-muted">Ask the assistant for the changes in the same chat and import the new file into the same trip. Matching ids update the trip; anything you edited in WanderGrid is shown as a conflict for you to decide.</p>
                <Prompt text={REVISE_PROMPT} label="Revision prompt" />
            </div>
            <p className="text-xs text-rp-muted">Assistants make mistakes: check opening times, prices and travel times before you book. Don't paste booking references or passport details into a chat.</p>
        </div>
    </RpSheet>
);

export default ItineraryAiGuide;
