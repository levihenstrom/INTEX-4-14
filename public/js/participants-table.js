// Fetch participants data and create interactive table
fetch('/api/participants-by-program')
    .then(response => response.json())
    .then(data => {
        // Initialize DataTable
        $('#participantsTable').DataTable({
        data: data,
        columns: [
            { data: 'program', title: 'Program' },
            { data: 'count', title: 'Participants' }
        ],
        order: [[1, 'desc']]
        });
    })
    .catch(error => console.error('Error:', error));

// Additional chart if needed
fetch('/api/participants-by-status')
    .then(response => response.json())
    .then(data => {
        const ctx = document.getElementById('participantsChart').getContext('2d');
        new Chart(ctx, {
        type: 'pie',
        data: {
            labels: data.map(item => item.status),
            datasets: [{
            data: data.map(item => item.count),
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56']
            }]
        }
        });
    })
    .catch(error => console.error('Error:', error));