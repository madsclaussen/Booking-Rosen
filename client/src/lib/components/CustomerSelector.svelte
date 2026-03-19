<script>
    // We make selectedCustomer bindable so the parent page can read/write to it
    let { selectedCustomer = $bindable(null) } = $props();

    let customers = $state([]);

    // Fetch the customers internally
    $effect(() => {
        fetch(`http://localhost:8000/api/customers`)
            .then((res) => res.json())
            .then((data) => {
                customers = data;
                // Auto-select the first customer if one isn't already selected
                if (data.length > 0 && !selectedCustomer) {
                    selectedCustomer = data[0];
                }
            })
            .catch((err) => console.error("Could not load customers:", err));
    });
</script>

{#if customers.length > 0}
    <div class="customer-selection">
        <h3>Who is booking?</h3>
        <div class="buttons">
            {#each customers as customer}
                <button
                    class:active={selectedCustomer?.id === customer.id}
                    onclick={() => (selectedCustomer = customer)}
                >
                    {customer.name}
                </button>
            {/each}
        </div>

        {#if selectedCustomer}
            <p>
                Currently booking as: <strong>{selectedCustomer.name}</strong>
            </p>
        {/if}
    </div>
{/if}

<style>
    .customer-selection {
        background: #f9f9f9;
        padding: 1rem;
        padding-bottom: 0%;
        border-radius: 8px;
        display: inline-block;
        margin-top: 1rem;
    }
    .customer-selection h3 {
        margin-top: 0;
        margin-bottom: 10px;
        font-size: 1.1rem;
    }
    .buttons {
        display: flex;
        gap: 0.5rem;
        justify-content: center;
        margin-bottom: 10px;
    }
    button {
        padding: 8px 16px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
    }
    button:hover {
        background: #eee;
    }
    button.active {
        background: #007bff;
        color: white;
        border-color: #007bff;
    }
</style>
