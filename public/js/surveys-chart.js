// Fetch NPS data and create chart
fetch('/api/surveys-nps')
    .then(response => response.json())
    .then(data => {
        const ctx = document.getElementById('npsChart').getContext('2d');
        
        new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(item => item.score),
            datasets: [{
            label: 'Response Count',
            data: data.map(item => item.count),
            backgroundColor: '#4BC0C0'
            }]
        },
        options: {
            responsive: true,
            plugins: {
            title: {
                display: true,
                text: 'Net Promoter Score Distribution'
            }
            }
        }
        });
    })
    .catch(error => console.error('Error:', error));

// Survey responses over time
fetch('/api/surveys-responses')
    .then(response => response.json())
    .then(data => {
        const ctx = document.getElementById('responsesChart').getContext('2d');
        
        new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => item.date),
            datasets: [{
            label: 'Survey Responses',
            data: data.map(item => item.count),
            borderColor: '#9966FF',
            fill: false
            }]
        }
        });
    })
    .catch(error => console.error('Error:', error));