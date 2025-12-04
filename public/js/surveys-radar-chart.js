// Survey NPS Distribution - Stacked Bar Chart
document.addEventListener('DOMContentLoaded', function() {
    let chart;
    let fullData = [];
    let selectedBucket = null;

    // NPS Colors - Green for Promoters, Yellow for Passive, Red for Detractors
    const npsColors = {
        'Promoter': '#9AB59D',   // Sage green
        'Passive': '#F4B092',    // Peach/Orange
        'Detractor': '#CE325B'   // Magenta/Red
    };

    // Greyed out color
    const greyedOutColor = '#E5E5E5';

    // Check if canvas exists (only for admin users)
    const canvas = document.getElementById('surveysRadarChart');
    if (!canvas) {
        return;
    }

    // Get current filter from URL
    const urlParams = new URLSearchParams(window.location.search);
    const currentFilterNPS = urlParams.get('filterNPS');
    if (currentFilterNPS) {
        selectedBucket = currentFilterNPS;
    }

    // Fetch NPS distribution and create chart
    fetch('/api/surveys-nps-distribution')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('NPS distribution data:', data);

            if (!data || data.length === 0) {
                canvas.parentElement.innerHTML = '<p class="text-muted text-center">No NPS data available</p>';
                return;
            }

            fullData = data;
            const ctx = canvas.getContext('2d');

            // Calculate total for percentages
            const total = data.reduce((sum, item) => sum + parseInt(item.count), 0);

            // Create one dataset per NPS bucket (for stacking)
            const datasets = data.map((item) => {
                const percentage = (parseInt(item.count) / total) * 100;
                const isSelected = !selectedBucket || item.bucket === selectedBucket;
                const baseColor = npsColors[item.bucket] || '#999';

                return {
                    label: item.bucket,
                    data: [percentage],
                    backgroundColor: isSelected ? baseColor : greyedOutColor,
                    borderColor: isSelected ? baseColor : '#D0D0D0',
                    borderWidth: 0,
                    borderSkipped: false,
                    rawCount: parseInt(item.count),
                    percentage: percentage
                };
            });

            chart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: [''],
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        title: {
                            display: false
                        },
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                font: {
                                    family: "'Montserrat', sans-serif",
                                    size: 12
                                },
                                color: '#3A3F3B',
                                padding: 20,
                                usePointStyle: true,
                                pointStyle: 'rect',
                                generateLabels: function(chart) {
                                    return chart.data.datasets.map((dataset, i) => {
                                        const isActive = !selectedBucket || dataset.label === selectedBucket;
                                        return {
                                            text: `${dataset.label} (${dataset.percentage.toFixed(1)}%)`,
                                            fillStyle: isActive ? npsColors[dataset.label] : greyedOutColor,
                                            strokeStyle: isActive ? npsColors[dataset.label] : '#D0D0D0',
                                            lineWidth: 0,
                                            hidden: false,
                                            index: i,
                                            datasetIndex: i
                                        };
                                    });
                                }
                            },
                            onClick: function(e, legendItem, legend) {
                                handleBucketClick(legendItem.datasetIndex);
                            }
                        },
                        tooltip: {
                            backgroundColor: '#3A3F3B',
                            titleFont: {
                                family: "'Montserrat', sans-serif",
                                size: 14,
                                weight: 'bold'
                            },
                            bodyFont: {
                                family: "'Montserrat', sans-serif",
                                size: 13
                            },
                            padding: 12,
                            cornerRadius: 8,
                            callbacks: {
                                title: function(context) {
                                    return context[0].dataset.label;
                                },
                                label: function(context) {
                                    const dataset = context.dataset;
                                    return ` ${dataset.rawCount} surveys (${dataset.percentage.toFixed(1)}%)`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            max: 100,
                            display: false
                        },
                        y: {
                            stacked: true,
                            display: false
                        }
                    },
                    onClick: (event, activeElements) => {
                        if (activeElements.length > 0) {
                            handleBucketClick(activeElements[0].datasetIndex);
                        } else {
                            // Clicked on empty space - clear filter
                            clearNPSFilter();
                        }
                    },
                    onHover: (event, activeElements) => {
                        event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
                    }
                }
            });

            // Function to handle NPS bucket selection
            function handleBucketClick(datasetIndex) {
                const clickedBucket = fullData[datasetIndex].bucket;

                if (selectedBucket === clickedBucket) {
                    // Clicking same bucket again - clear filter
                    clearNPSFilter();
                } else {
                    // Redirect with filter
                    const currentUrl = new URL(window.location.href);
                    currentUrl.searchParams.set('filterNPS', clickedBucket);
                    currentUrl.searchParams.set('page', '1');
                    window.location.href = currentUrl.toString();
                }
            }

            // Function to clear NPS filter
            function clearNPSFilter() {
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.delete('filterNPS');
                currentUrl.searchParams.set('page', '1');
                window.location.href = currentUrl.toString();
            }
        })
        .catch(error => console.error('Error loading NPS distribution:', error));
});
