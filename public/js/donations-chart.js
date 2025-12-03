// Fetch donations data and create chart
fetch('/api/donations-by-month')
    .then(response => response.json())
    .then(data => {
        const ctx = document.getElementById('donationsChart').getContext('2d');
        
        new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => item.month),
            datasets: [{
            label: 'Monthly Donations',
            data: data.map(item => item.total),
            borderColor: '#36A2EB',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
            title: {
                display: true,
                text: 'Donations Over Time'
            }
            },
            scales: {
            y: {
                beginAtZero: true,
                ticks: {
                callback: function(value) {
                    return '$' + value.toLocaleString();
                }
                }
            }
            }
        }
        });
    })
    .catch(error => console.error('Error:', error));

// Total donations display
fetch('/api/donations-total')
    .then(response => response.json())
    .then(data => {
        document.getElementById('totalDonations').textContent = 
        '$' + data[0].total.toLocaleString();
    })
    .catch(error => console.error('Error:', error));