// Milestones by Category - Stacked Percentage Bar Chart
document.addEventListener('DOMContentLoaded', function() {
    let chart;
    let fullData = [];
    let selectedCategory = null;

    // Color palette from the design
    const categoryColors = [
        '#9AB59D',  // Sage green
        '#978EC4',  // Purple
        '#F9AFB1',  // Pink
        '#99B7C6',  // Blue
        '#F4B092',  // Peach
        '#CE325B',  // Magenta
        '#FFD8D1',  // Light pink
        '#3A3F3B',  // Dark gray
    ];

    // Greyed out color for non-selected categories
    const greyedOutColor = '#E5E5E5';

    // Check if canvas exists (only for admin users)
    const canvas = document.getElementById('milestonesByCategoryChart');
    if (!canvas) {
        return;
    }

    // Get current filter from URL
    const urlParams = new URLSearchParams(window.location.search);
    const currentFilterCategory = urlParams.get('filterCategory');
    if (currentFilterCategory) {
        selectedCategory = currentFilterCategory;
    }

    // Get filter parameters from canvas data attributes
    const search = canvas.dataset.search || '';
    const filterTitle = canvas.dataset.filterTitle || '';
    const filterCategory = canvas.dataset.filterCategory || '';
    const filterParticipantId = canvas.dataset.filterParticipantId || '';

    // Build query string with filters
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (filterTitle) params.append('filterTitle', filterTitle);
    // Don't include filterCategory in API call - we want to show all categories but highlight the selected one
    if (filterParticipantId) params.append('filterParticipantID', filterParticipantId);

    const queryString = params.toString() ? `?${params.toString()}` : '';

    // Fetch milestones by category and create chart
    fetch('/api/milestones-by-category' + queryString)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data || data.length === 0) {
                canvas.parentElement.innerHTML = '<p class="text-muted text-center">No milestone data available</p>';
                return;
            }
            
            fullData = data;
            const ctx = canvas.getContext('2d');

            // Calculate total for percentages
            const total = data.reduce((sum, item) => sum + parseInt(item.count), 0);

            // Create one dataset per category (for stacking)
            const datasets = data.map((item, index) => {
                const percentage = (parseInt(item.count) / total) * 100;
                const isSelected = !selectedCategory || item.category === selectedCategory;
                const baseColor = categoryColors[index % categoryColors.length];

                // Only round outer edges: left side of first segment, right side of last segment
                let borderRadius = 0;
                if (index === 0) {
                    // First segment - round left corners only
                    borderRadius = { topLeft: 12, bottomLeft: 12, topRight: 0, bottomRight: 0 };
                } else if (index === data.length - 1) {
                    // Last segment - round right corners only
                    borderRadius = { topLeft: 0, bottomLeft: 0, topRight: 12, bottomRight: 12 };
                }

                return {
                    label: item.category,
                    data: [percentage],
                    backgroundColor: isSelected ? baseColor : greyedOutColor,
                    borderColor: isSelected ? baseColor : '#D0D0D0',
                    borderWidth: 0,
                    borderSkipped: false,
                    borderRadius: borderRadius,
                    categoryIndex: index,
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
                                    size: 11
                                },
                                color: '#3A3F3B',
                                padding: 15,
                                usePointStyle: true,
                                pointStyle: 'rect',
                                generateLabels: function(chart) {
                                    return chart.data.datasets.map((dataset, i) => {
                                        const isActive = !selectedCategory || dataset.label === selectedCategory;
                                        return {
                                            text: `${dataset.label} (${dataset.percentage.toFixed(1)}%)`,
                                            fillStyle: isActive ? categoryColors[i % categoryColors.length] : greyedOutColor,
                                            strokeStyle: isActive ? categoryColors[i % categoryColors.length] : '#D0D0D0',
                                            lineWidth: 0,
                                            hidden: false,
                                            index: i,
                                            datasetIndex: i
                                        };
                                    });
                                }
                            },
                            onClick: function(e, legendItem, legend) {
                                handleCategoryClick(legendItem.datasetIndex);
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
                                    return ` ${dataset.rawCount} milestones (${dataset.percentage.toFixed(1)}%)`;
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
                            handleCategoryClick(activeElements[0].datasetIndex);
                        } else {
                            // Clicked on empty space - clear filter
                            clearCategoryFilter();
                        }
                    },
                    onHover: (event, activeElements) => {
                        event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
                    }
                }
            });

            // Function to handle category selection
            function handleCategoryClick(datasetIndex) {
                const clickedCategory = fullData[datasetIndex].category;

                if (selectedCategory === clickedCategory) {
                    // Clicking same category again - clear filter
                    clearCategoryFilter();
                } else {
                    // Redirect with filter
                    const currentUrl = new URL(window.location.href);
                    currentUrl.searchParams.set('filterCategory', clickedCategory);
                    currentUrl.searchParams.set('page', '1');
                    window.location.href = currentUrl.toString();
                }
            }

            // Function to clear category filter
            function clearCategoryFilter() {
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.delete('filterCategory');
                currentUrl.searchParams.set('page', '1');
                window.location.href = currentUrl.toString();
            }
        })
        .catch(error => console.error('Error loading milestones by category:', error));
});
