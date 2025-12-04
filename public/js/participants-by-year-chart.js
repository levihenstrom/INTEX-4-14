// Fetch new participants by year and create chart
fetch('/api/participants-by-year')
    .then(response => response.json())
    .then(data => {
        const ctx = document.getElementById('participantsByYearChart').getContext('2d');

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(item => item.year),
                datasets: [{
                    label: 'New Participants',
                    data: data.map(item => item.count),
                    backgroundColor: '#9AB59D',
                    borderColor: '#7fa082',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: false
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 25
                        },
                        grid: {
                            display: false
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                },
                onHover: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const datasetIndex = activeElements[0].datasetIndex;
                        const index = activeElements[0].index;
                        const dataset = chart.data.datasets[datasetIndex];

                        // Create array of colors - gray for non-hovered, original color for hovered
                        const colors = dataset.data.map((_, i) =>
                            i === index ? '#9AB59D' : 'rgba(154, 181, 157, 0.3)'
                        );

                        dataset.backgroundColor = colors;
                        chart.update('none'); // Update without animation for smooth hover
                    } else {
                        // Reset all bars to original color when not hovering
                        chart.data.datasets[0].backgroundColor = '#9AB59D';
                        chart.update('none');
                    }
                }
            }
        });
    })
    .catch(error => console.error('Error:', error));
