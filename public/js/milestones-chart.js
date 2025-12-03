// Fetch milestones by category
fetch('/api/milestones-by-category')
    .then(response => response.json())
    .then(data => {
        const ctx = document.getElementById('milestonesChart').getContext('2d');
        
        new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(item => item.category),
            datasets: [{
            data: data.map(item => item.count),
            backgroundColor: [
                '#FF6384',
                '#36A2EB',
                '#FFCE56',
                '#4BC0C0',
                '#9966FF',
                '#FF9F40'
            ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
            title: {
                display: true,
                text: 'Milestones by Category'
            },
            legend: {
                position: 'right'
            }
            }
        }
        });
    })
    .catch(error => console.error('Error:', error));

// Milestones over time
fetch('/api/milestones-over-time')
    .then(response => response.json())
    .then(data => {
        const ctx = document.getElementById('milestonesTimeChart').getContext('2d');
        
        new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(item => item.month),
            datasets: [{
            label: 'Milestones Achieved',
            data: data.map(item => item.count),
            backgroundColor: '#FF9F40'
            }]
        },
        options: {
            responsive: true,
            scales: {
            y: {
                beginAtZero: true
            }
            }
        }
        });
    })
    .catch(error => console.error('Error:', error));