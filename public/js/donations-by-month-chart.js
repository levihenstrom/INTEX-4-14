// Wait for DOM to be fully loaded before creating chart
document.addEventListener('DOMContentLoaded', function() {
    let chart;
    let fullData = [];
    let selectedIndex = null;

    // Function to update metric cards
    function updateMetricCards(upToIndex) {
        const dataUpToPoint = fullData.slice(0, upToIndex + 1);
        const selectedMonth = fullData[upToIndex];

        // Calculate total up to selected date
        const totalUpToDate = dataUpToPoint.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);

        // Get selected month amount
        const monthAmount = parseFloat(selectedMonth.total) || 0;

        // Update the cards
        const totalCard = document.querySelector('.col-md-4:nth-child(1) .card-body h3');
        const monthCard = document.querySelector('.col-md-4:nth-child(2) .card-body h3');
        const monthCardLabel = document.querySelector('.col-md-4:nth-child(2) .card-body p');

        if (totalCard) {
            totalCard.textContent = '$' + totalUpToDate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (monthCard) {
            monthCard.textContent = '$' + monthAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (monthCardLabel) {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            monthCardLabel.textContent = `Donations in ${monthNames[selectedMonth.month - 1]} ${selectedMonth.year}`;
        }
    }

    // Function to update chart with filtered data
    function updateChartData(upToIndex) {
        // Show data up to selected point
        const dataUpToPoint = fullData.slice(0, upToIndex + 1);
        chart.data.labels = dataUpToPoint.map(item => {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${monthNames[item.month - 1]} ${item.year}`;
        });
        chart.data.datasets[0].data = dataUpToPoint.map(item => parseFloat(item.total) || 0);
        chart.update();
    }

    // Check if canvas exists (only for admin users)
    const canvas = document.getElementById('donationsByMonthChart');
    if (!canvas) {
        return; // Exit if chart canvas doesn't exist
    }

    // Fetch donations by month and create chart
    fetch('/api/donations-by-month')
        .then(response => response.json())
        .then(data => {
            fullData = data;
            const ctx = canvas.getContext('2d');

        // Format data for chart
        const labels = data.map(item => {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${monthNames[item.month - 1]} ${item.year}`;
        });

        const amounts = data.map(item => parseFloat(item.total) || 0);

        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Donations',
                    data: amounts,
                    backgroundColor: 'rgba(154, 181, 157, 0.2)',
                    borderColor: '#9AB59D',
                    borderWidth: 2,
                    pointBackgroundColor: '#9AB59D',
                    pointBorderColor: '#7fa082',
                    pointBorderWidth: 1,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: '#7fa082',
                    pointHoverBorderColor: '#9AB59D',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Donations Over Time',
                        font: {
                            family: "'DM Serif Display', serif",
                            size: 24,
                            weight: 'normal'
                        },
                        color: '#3A3F3B'
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                label += '$' + context.parsed.y.toFixed(2);
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1000,
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
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
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        selectedIndex = index;
                        const dataPoint = fullData[index];

                        // Store the selection in sessionStorage so it persists across reload
                        sessionStorage.setItem('selectedMonthIndex', index);

                        // Calculate first and last day of the month for filtering donation cards
                        const year = dataPoint.year;
                        const month = dataPoint.month;
                        const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;

                        // Calculate last day of month
                        const lastDay = new Date(year, month, 0);
                        const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

                        // Redirect to donations page with date filters (this will reload and filter the donation cards)
                        window.location.href = `/donations?filterStartDate=${firstDay}&filterEndDate=${lastDayStr}`;
                    } else {
                        // Clicked on empty space - clear filters
                        sessionStorage.removeItem('selectedMonthIndex');
                        window.location.href = '/donations';
                    }
                },
                onHover: (event, activeElements) => {
                    event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
                }
            }
        });

        // Check if there's a saved selection from sessionStorage (after redirect)
        const savedIndex = sessionStorage.getItem('selectedMonthIndex');
        if (savedIndex !== null) {
            const index = parseInt(savedIndex);
            if (index >= 0 && index < fullData.length) {
                // Update metric cards
                updateMetricCards(index);

                // Update chart to show only data up to selected point
                updateChartData(index);
            }
        }
        })
        .catch(error => console.error('Error:', error));
});
