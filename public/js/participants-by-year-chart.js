// Fetch new participants by year and create chart
fetch('/api/participants-by-year')
    .then(response => response.json())
    .then(data => {
        const ctx = document.getElementById('participantsByYearChart').getContext('2d');

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(item => item.year),
                datasets: [{
                    label: 'New Participants',
                    data: data.map(item => item.count),
                    backgroundColor: '#CE325B',
                    borderColor: '#CE325B',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'New Participants by Year',
                        font: {
                            family: "'DM Serif Display', serif",
                            size: 24,
                            weight: 'normal'
                        },
                        color: '#3A3F3B'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        },
                        grid: {
                            display: false
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Year'
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    })
    .catch(error => console.error('Error:', error));
