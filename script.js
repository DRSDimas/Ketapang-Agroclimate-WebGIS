let forecastHourIndex = 0;
let activeVariableId = 'soil_moisture_0_to_1cm';

const weatherLayerConfigs = [
    { id: 'soil_moisture_0_to_1cm', name: 'Surface Soil Moisture (0-1cm)' },
    { id: 'soil_moisture_9_to_27cm', name: 'Deep Soil Moisture (9-27cm)' },
    { id: 'soil_temperature_18cm', name: 'Deep Soil Temperature (18cm)' },
    { id: 'temperature_2m', name: 'Air Temperature (2m)' },
    { id: 'precipitation', name: 'Precipitation (mm)' },
    { id: 'direct_radiation', name: 'Direct Solar Radiation' },
    { id: 'relative_humidity_2m', name: 'Relative Humidity (2m)' },
    { id: 'wind_u_component_10m', name: 'Wind U-Component (10m)' }
];

fetch('./Ketapang.geojson')
    .then((response) => response.json())
    .then((geojson) => {
        const simplifiedBoundary = turf.simplify(geojson, { tolerance: 0.001, highQuality: true });
        const omProtocolOptions = OMWeatherMapLayer.defaultOmProtocolSettings;
        omProtocolOptions.clippingOptions = { geojson: simplifiedBoundary };

        maplibregl.addProtocol('om', (params, abortController) =>
            OMWeatherMapLayer.omProtocol(params, abortController, omProtocolOptions)
        );

        const map = new maplibregl.Map({
            container: 'map',
            style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
            center: [110.38, -1.50],
            zoom: 7,
            hash: true,
            pitch: 45,      
            bearing: -10,
            attributionControl: false
        });

        map.addControl(new maplibregl.AttributionControl({ compact: true, position: 'top-right' }));

        map.on('load', () => {
            const initializeLayerSource = (config) => {
                if (!map.getSource(config.id + 'Source')) {
                    map.addSource(config.id + 'Source', {
                        url: `om://https://map-tiles.open-meteo.com/data_spatial/dwd_icon/latest.json?time_step=valid_times_0&variable=${config.id}`,
                        type: 'raster',
                        maxzoom: 12
                    });
                }
                if (!map.getLayer(config.id + 'Layer')) {
                    map.addLayer({
                        id: config.id + 'Layer',
                        type: 'raster',
                        source: config.id + 'Source',
                        paint: { 'raster-opacity': 0.50 }
                    }); 
                }
            };

            initializeLayerSource(weatherLayerConfigs[0]);

            document.querySelectorAll('input[name="layer"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const newId = e.target.value;
                    const config = weatherLayerConfigs.find(c => c.id === newId);
                    initializeLayerSource(config);
                    
                    weatherLayerConfigs.forEach(c => {
                        if (map.getLayer(c.id + 'Layer')) {
                            map.setLayoutProperty(c.id + 'Layer', 'visibility', c.id === newId ? 'visible' : 'none');
                        }
                    });
                    activeVariableId = newId;
                });
            });

            const slider = document.getElementById('time-slider');
            const timeDisplay = document.getElementById('time-display');

            slider.addEventListener('input', (e) => {
                forecastHourIndex = e.target.value;
                timeDisplay.innerText = `+${forecastHourIndex} hours`;

                weatherLayerConfigs.forEach(config => {
                    if (map.getSource(config.id + 'Source')) {
                        map.getSource(config.id + 'Source').setUrl(`om://https://map-tiles.open-meteo.com/data_spatial/dwd_icon/latest.json?time_step=valid_times_${forecastHourIndex}&variable=${config.id}`);
                    }
                });
            });

            const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

            map.on('mousemove', async (e) => {
                const activeUrl = `https://map-tiles.open-meteo.com/data_spatial/dwd_icon/latest.json?time_step=valid_times_${forecastHourIndex}&variable=${activeVariableId}`;
                const { value } = await OMWeatherMapLayer.getValueFromLatLong(e.lngLat.lat, e.lngLat.lng, 'om://' + activeUrl);

                const isPrecipitationLayer = activeVariableId === 'precipitation';
                const finalValue = (isPrecipitationLayer && !isFinite(value)) ? 0 : value;

                if (isFinite(finalValue)) {
                    const colorScale = OMWeatherMapLayer.getColorScale(activeVariableId, false, OMWeatherMapLayer.defaultOmProtocolSettings.colorScales);
                    const color = (isPrecipitationLayer && finalValue === 0) ? [220, 220, 220, 0.9] : OMWeatherMapLayer.getColor(colorScale, finalValue);
                    const config = weatherLayerConfigs.find(c => c.id === activeVariableId);
                    
                    popup.setLngLat(e.lngLat)
                         .setHTML(`<div class="popup-div" style="background: rgba(${color.join(',')});">${config.name}: ${finalValue.toFixed(2)} ${colorScale.unit}</div>`)
                         .addTo(map);
                } else {
                    popup.remove();
                }
            });

            let isRotating = true;
            function rotateCamera() {
                if (!isRotating) return;
                map.rotateTo((map.getBearing() + 0.05) % 360, { duration: 0 });
                requestAnimationFrame(rotateCamera);
            }
            rotateCamera();

            const stopRotation = () => { isRotating = false; };
            map.on('mousedown', stopRotation);
            map.on('touchstart', stopRotation);
            map.on('wheel', stopRotation);
            map.on('zoomstart', stopRotation);
            map.on('dragstart', stopRotation);
        });
    })
    .catch((error) => console.error("Initialization error:", error));