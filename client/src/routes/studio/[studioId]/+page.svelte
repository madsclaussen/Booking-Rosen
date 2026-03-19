<script>
    import { page } from "$app/state";
    import "@event-calendar/core/index.css";
    import { Calendar, TimeGrid, Interaction } from "@event-calendar/core";

    import CustomerSelector from "$lib/components/CustomerSelector.svelte";

    let studioId = $derived(page.params.studioId);
    let studioName = $state("Loading Studio...");

    let selectedCustomer = $state(null);
    let customers = $state([]);

    // NEW: Separate states for fetched DB events vs the temporary draft
    let dbEvents = $state([]);
    let draftBooking = $state(null); // Holds the raw start/end for the POST request
    let draftEvent = $state(null); // Holds the visual calendar event
    let isSubmitting = $state(false);

    // Helper function to keep the calendar visually updated
    function updateCalendarEvents() {
        // Combines existing DB events with the draft event (if it exists)
        options.events = draftEvent ? [...dbEvents, draftEvent] : [...dbEvents];
    }

    // Function to fetch existing bookings from the database
    async function fetchBookings() {
        if (!studioId) return;
        try {
            const res = await fetch(
                `http://localhost:8000/api/bookings/${studioId}`,
            );
            if (res.ok) {
                const data = await res.json();

                // Map the Postgres columns to the Event Calendar format
                dbEvents = data.map((booking) => ({
                    id: String(booking.id),
                    start: booking.start_time,
                    end: booking.end_time,
                    title: `Booked: ${booking.customer_name}`, // FIXED: Removed the glued description
                    backgroundColor: getCustomerColor(booking.customer_id),
                    borderColor: getCustomerColor(booking.customer_id),
                    textColor: "#1e293b",
                    extendedProps: {
                        customerId: booking.customer_id,
                        description: booking.description || "",
                    },
                }));

                updateCalendarEvents(); // Refresh the calendar UI
            }
        } catch (error) {
            console.error("Error fetching bookings:", error);
        }
    }

    // Fetch the studio name AND bookings on mount
    $effect(() => {
        if (studioId) {
            // Fetch Studio Name
            fetch(`http://localhost:8000/api/studios/${studioId}`)
                .then((res) => res.json())
                .then((data) => {
                    studioName = data.name ? data.name : "Studio Not Found";
                })
                .catch(() => {
                    studioName = "Error Loading Studio";
                });

            // Fetch Bookings
            fetchBookings();
        }
    });

    function getCustomerColor(id) {
        if (!id) return "#e2e8f0";
        const lightColors = [
            "#fecdd3",
            "#fed7aa",
            "#d9f99d",
            "#bfdbfe",
            "#e9d5ff",
            "#a7f3d0",
        ];
        return lightColors[id % lightColors.length];
    }

    // NEW: State for when an existing booking is clicked
    let clickedBooking = $state(null);

    // ... (keep your fetchBookings and $effect blocks exactly the same) ...

    let options = $state({
        view: "timeGridWeek",
        slotMinTime: "08:00:00",
        slotMaxTime: "22:00:00",
        allDaySlot: false,
        selectable: true,

        // NEW: This allows you to drag existing events to new times! (Editing)
        editable: true,

        events: [],

        select: (info) => {
            if (!selectedCustomer) {
                alert("Please select a customer first.");
                return;
            }

            draftBooking = { start: info.startStr, end: info.endStr };

            // 1. Get the base hex color
            const baseColor = getCustomerColor(selectedCustomer.id);

            // 2. Append '80' to make the background 50% transparent
            const fadedColor = baseColor + "80";

            draftEvent = {
                id: "draft-event",
                start: info.startStr,
                end: info.endStr,
                title: `Draft: ${selectedCustomer.name}`,

                // 3. Apply the faded color to the background, but keep the border solid!
                backgroundColor: fadedColor,
                borderColor: baseColor,
                textColor: "#1e293b",
            };

            clickedBooking = null;
            updateCalendarEvents();
        },

        // UPDATED: Handle clicking an existing event
        // Inside options = $state({ ... })
        // UPDATED: Handle clicking an existing event
        eventClick: (info) => {
            if (info.event.id === "draft-event") return;

            const dStart = info.event.start;
            const dEnd = info.event.end;
            const pad = (n) => (n < 10 ? "0" + n : n);

            // 1. Save the YYYY-MM-DD so we remember what day this is on
            const baseDate = `${dStart.getFullYear()}-${pad(dStart.getMonth() + 1)}-${pad(dStart.getDate())}`;

            // 2. Extract just the HH:MM for the time inputs
            const startTime = `${pad(dStart.getHours())}:${pad(dStart.getMinutes())}`;
            const endTime = `${pad(dEnd.getHours())}:${pad(dEnd.getMinutes())}`;

            clickedBooking = {
                id: info.event.id,
                title: info.event.title, // Keep title for the UI
                customerId: info.event.extendedProps.customerId, // Keep ID hidden for the DB
                description: info.event.extendedProps.description,
                baseDate: baseDate,
                startTime: startTime,
                endTime: endTime,
            };

            draftBooking = null;
            updateCalendarEvents();
        },

        // 1. SHOW UNDER THE TITLE (WITH LINE BREAKS)
        eventContent: (info) => {
            let htmlContent = `
                <div class="ec-event-time">${info.timeText}</div>
                <div class="ec-event-title" style="font-weight: bold;">${info.event.title}</div>
            `;

            const desc = info.event.extendedProps?.description;
            if (desc) {
                // FIXED: Put entirely on one line, and added .trim() to clean up extra spaces
                htmlContent += `<div style="font-size: 0.85em; margin-top: 6px; padding-top: 4px; border-top: 1px dashed rgba(0,0,0,0.2); white-space: pre-wrap; line-height: 1.3; opacity: 0.9;">${desc.trim()}</div>`;
            }

            return { html: htmlContent };
        },

        // 2. SHOW ON HOVER (NATIVE BROWSER TOOLTIP)
        eventDidMount: (info) => {
            const desc = info.event.extendedProps?.description;
            if (desc) {
                // FIXED: Use setAttribute to force the native HTML tooltip
                info.el.setAttribute("title", desc.trim());
            }
        },

        // NEW: Handle Drag-and-Drop Editing
        eventDrop: async (info) => {
            // info.event contains the NEW start and end times after dragging
            const confirmMove = confirm(
                `Move this booking to ${info.event.start.toLocaleString()}?`,
            );

            if (confirmMove) {
                // Here you would make a PUT/PATCH request to your Deno server
                // to update the start_time and end_time in Postgres.
                console.log(
                    "Moved event ID:",
                    info.event.id,
                    "to",
                    info.event.start,
                );
            } else {
                info.revert(); // Snaps the event back if they cancel
            }
        },
    });

    async function handleAddBooking() {
        if (!draftBooking || !selectedCustomer) return;

        isSubmitting = true;

        const payload = {
            studioId: studioId,
            customerId: selectedCustomer.id,
            start: draftBooking.start,
            end: draftBooking.end,
        };

        try {
            const res = await fetch("http://localhost:8000/api/addbooking", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                alert("Booking saved to the database!");

                // Clear drafts
                draftBooking = null;
                draftEvent = null;

                // Fetch fresh data from DB so the new booking gets a real ID
                await fetchBookings();
            } else {
                alert("Failed to save booking.");
            }
        } catch (error) {
            console.error("Error saving booking:", error);
            alert("Network error.");
        } finally {
            isSubmitting = false;
        }
    }

    async function handleUpdateBooking() {
        if (!clickedBooking) return;
        isSubmitting = true;

        // Re-combine the original date with the new times
        // Example: "2026-03-20" + "T" + "14:30" + ":00"
        const newStart = new Date(
            `${clickedBooking.baseDate}T${clickedBooking.startTime}:00`,
        ).toISOString();
        const newEnd = new Date(
            `${clickedBooking.baseDate}T${clickedBooking.endTime}:00`,
        ).toISOString();

        // Package the edited data
        const payload = {
            customerId: clickedBooking.customerId, // We kept this from the original event!
            start: newStart,
            end: newEnd,
            description: clickedBooking.description,
        };

        try {
            const res = await fetch(
                `http://localhost:8000/api/bookings/${clickedBooking.id}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                },
            );

            if (res.ok) {
                alert("Booking updated successfully!");
                clickedBooking = null;
                await fetchBookings();
            } else {
                alert("Failed to update booking.");
            }
        } catch (error) {
            console.error("Error updating:", error);
            alert("Network error.");
        } finally {
            isSubmitting = false;
        }
    }

    // NEW: Function to delete the booking
    async function handleDeleteBooking() {
        if (!clickedBooking) return;

        const confirmDelete = confirm(
            "Are you absolutely sure you want to delete this booking?",
        );
        if (!confirmDelete) return;

        isSubmitting = true;

        try {
            const res = await fetch(
                `http://localhost:8000/api/bookings/${clickedBooking.id}`,
                {
                    method: "DELETE",
                },
            );

            if (res.ok) {
                alert("Booking deleted successfully.");
                clickedBooking = null;
                await fetchBookings(); // Refresh the calendar from the DB
            } else {
                alert("Failed to delete booking.");
            }
        } catch (error) {
            console.error("Error deleting booking:", error);
            alert("Network error.");
        } finally {
            isSubmitting = false;
        }
    }

    // Helper to clear the draft cleanly
    function cancelSelection() {
        draftBooking = null;
        draftEvent = null;
        updateCalendarEvents();
    }
</script>

<div class="header">
    <h1>Booking: {studioName}</h1>
    <CustomerSelector bind:selectedCustomer />

    {#if draftBooking}
        <div class="action-bar">
            <p>
                Ready to book from <strong
                    >{new Date(draftBooking.start).toLocaleString()}</strong
                >
                to
                <strong>{new Date(draftBooking.end).toLocaleString()}</strong>?
            </p>
            <button
                class="book-btn"
                onclick={handleAddBooking}
                disabled={isSubmitting}
            >
                {isSubmitting ? "Saving..." : "Add Booking"}
            </button>
            <button class="cancel-btn" onclick={cancelSelection}>
                Cancel Selection
            </button>
        </div>
    {/if}

    {#if clickedBooking}
        <div class="action-bar manage-bar">
            <h3>Edit Booking</h3>
            <p style="margin-top: 0; color: #64748b; font-size: 0.9rem;">
                <strong>{clickedBooking.title}</strong> on {clickedBooking.baseDate}
            </p>

            <div class="edit-form">
                <div class="form-group">
                    <label for="start">Start Time</label>
                    <input
                        type="time"
                        id="start"
                        bind:value={clickedBooking.startTime}
                    />
                </div>

                <div class="form-group">
                    <label for="end">End Time</label>
                    <input
                        type="time"
                        id="end"
                        bind:value={clickedBooking.endTime}
                    />
                </div>

                <div class="form-group full-width">
                    <label for="description">Description (Notes)</label>
                    <textarea
                        id="description"
                        rows="2"
                        bind:value={clickedBooking.description}
                        placeholder="Add any special requirements here..."
                    ></textarea>
                </div>
            </div>

            <div class="button-row">
                <button
                    class="update-btn"
                    onclick={handleUpdateBooking}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
                <button
                    class="delete-btn"
                    onclick={handleDeleteBooking}
                    disabled={isSubmitting}
                >
                    Delete
                </button>
                <button
                    class="cancel-btn"
                    onclick={() => (clickedBooking = null)}
                >
                    Cancel
                </button>
            </div>
        </div>
    {/if}
</div>

<div class="calendar-container">
    <Calendar plugins={[TimeGrid, Interaction]} {options} />
</div>

<style>
    .header {
        margin-bottom: 2rem;
        text-align: center;
        font-family: sans-serif;
    }
    .action-bar {
        margin-top: 1.5rem;
        padding: 1rem;
        background: #eef2ff;
        border-radius: 8px;
        display: inline-block;
    }
    .book-btn {
        background-color: #10b981;
        color: white;
        border: none;
        padding: 10px 20px;
        font-size: 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        margin-right: 10px;
    }
    .book-btn:disabled {
        background-color: #9ca3af;
        cursor: not-allowed;
    }
    .cancel-btn {
        background-color: transparent;
        color: #ef4444;
        border: 1px solid #ef4444;
        padding: 10px 20px;
        font-size: 1rem;
        border-radius: 6px;
        cursor: pointer;
    }
    .calendar-container {
        height: 80vh;
        width: 80%;
        background: white;
        padding: 0 10% 10% 10%;
        margin: 0 auto;
    }

    /* NEW styles for the manage bar */
    .manage-bar {
        background: #fff1f2; /* Light red background to indicate caution */
        border: 1px solid #fecdd3;
    }
    .manage-bar p {
        margin-top: 0;
    }
    .delete-btn {
        background-color: #ef4444; /* Red button */
        color: white;
        border: none;
        padding: 10px 20px;
        font-size: 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        margin-right: 10px;
    }
    .delete-btn:hover {
        background-color: #dc2626;
    }
    .delete-btn:disabled {
        background-color: #fca5a5;
        cursor: not-allowed;
    }

    .manage-bar {
        background: white;
        border: 1px solid #e2e8f0;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        text-align: left; /* Align form to the left */
        width: 100%;
        max-width: 600px;
        box-sizing: border-box;
    }

    .manage-bar h3 {
        margin-top: 0;
        margin-bottom: 1rem;
        color: #1e293b;
    }

    .edit-form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .form-group {
        display: flex;
        flex-direction: column;
    }

    .form-group.full-width {
        grid-column: span 2;
    }

    .form-group label {
        font-size: 0.85rem;
        font-weight: bold;
        color: #64748b;
        margin-bottom: 0.25rem;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
        padding: 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        font-family: inherit;
        font-size: 1rem;
    }

    .button-row {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .update-btn {
        background-color: #3b82f6; /* Blue button for updating */
        color: white;
        border: none;
        padding: 10px 20px;
        font-size: 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
    }

    .update-btn:hover {
        background-color: #2563eb;
    }
</style>
