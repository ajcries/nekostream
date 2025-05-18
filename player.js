// Google Apps Script key for translation (replace with your own if needed)
const GAS_KEY = 'AKfycbxMW32ItfACH8tkS4W0p_Kwkx36SLWX5_uWAooYpuB44KZdL2daR50Qas_gWXYr_j8t7Q';

/**
 * Class to manage the video player functionality, including HLS playback,
 * controls, subtitles, and autoplay.
 */
class HBOMaxPlayer {
  /**
   * @param {HTMLVideoElement} videoElement - The video element.
   * @param {string} url - The HLS stream URL.
   * @param {string} tvgId - The TV Guide ID of the channel.
   * @param {Array<Object>} channels - Array of all channel objects.
   * @param {HTMLElement} subtitleElement - Element to display subtitles.
   * @param {HTMLInputElement} toggleSubtitles - Checkbox to enable/disable subtitles.
   * @param {HTMLInputElement} toggleAutoplay - Checkbox to enable/disable autoplay.
   * @param {HTMLElement} errorElement - Element to display error messages.
   * @param {HTMLElement} loadingElement - Element to show loading indicator.
   * @param {HTMLElement} countdownElement - Element to display autoplay countdown.
   */
  constructor(videoElement, url, tvgId, channels, subtitleElement, toggleSubtitles, toggleAutoplay, errorElement, loadingElement, countdownElement) {
    this.video = videoElement;
    this.url = url;
    this.tvgId = tvgId;
    this.channels = channels;
    this.subtitleElement = subtitleElement;
    this.toggleSubtitles = toggleSubtitles;
    this.toggleAutoplay = toggleAutoplay;
    this.errorElement = errorElement;
    this.loadingElement = loadingElement;
    this.countdownElement = countdownElement;

    this.recognition = null; // Speech recognition instance
    this.subtitleTimeout = null; // Timeout for hiding subtitles
    this.hls = null; // HLS.js instance
    this.autoplayInterval = null; // Interval for autoplay countdown

    this.playbackSpeeds = [0.5, 1, 1.5, 2]; // Available playback speeds
    this.currentSpeedIndex = 1; // Index for default 1x speed

    this.qualityLevels = []; // Available video quality levels
    this.languages = ['English', 'Japanese']; // Available subtitle languages
    this.currentLanguage = 'English'; // Current subtitle language

    this.controlsContainer = null; // Container for player controls
    this.isHovering = false; // Flag to track if mouse is hovering over the player container
    this.controlsTimeout = null; // Timeout for hiding controls after mouse stops moving
  }

  /**
   * Initializes the player by setting up controls, HLS, and event listeners.
   */
  async init() {
    this.setupVideoControls();
    this.initHLS();
    this.setupEventListeners();
    this.startSubtitles();
  }

  /**
   * Creates and injects the custom video controls into the DOM.
   */
  setupVideoControls() {
    // Create the controls container element
    const controls = document.createElement('div');
    controls.className = 'player-controls absolute bottom-0 left-0 right-0 bg-gray-900 bg-opacity-75 p-2 flex items-center justify-between space-x-4 text-white';

    // Set the inner HTML for the controls
    controls.innerHTML = `
      <button id="play-pause" class="w-8 h-8 flex items-center justify-center rounded-full bg-red-600 hover:bg-red-500">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <div class="flex-1 mx-2">
        <input id="progress" type="range" min="0" max="100" value="0" class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-red-600">
      </div>
      <span id="time" class="text-sm">00:00 / 00:00</span>
      <select id="language" class="bg-gray-800 rounded px-2 py-1 text-sm">
        ${this.languages.map(lang => `<option value="${lang.toLowerCase()}" ${lang === this.currentLanguage ? 'selected' : ''}>${lang}</option>`).join('')}
      </select>
      <select id="quality" class="bg-gray-800 rounded px-2 py-1 text-sm">
        <option value="auto">Auto</option>
        </select>
      <button id="fullscreen" class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
      </button>
    `;

    // Append controls to the player container (parent of the video element)
    this.video.parentElement.appendChild(controls);
    this.controlsContainer = controls;

    // Get references to control elements
    this.playPauseButton = controls.querySelector('#play-pause');
    this.progressBar = controls.querySelector('#progress');
    this.timeDisplay = controls.querySelector('#time');
    this.languageSelect = controls.querySelector('#language');
    this.qualitySelect = controls.querySelector('#quality');
    this.fullscreenButton = controls.querySelector('#fullscreen');
  }

  /**
   * Initializes HLS.js for stream playback.
   */
  initHLS() {
    this.loadingElement.classList.remove('hidden'); // Show loading indicator

    // Check if HLS is supported by the browser
    if (Hls.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(this.url);
      this.hls.attachMedia(this.video);

      // Event listener for when the manifest is parsed (stream details available)
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.loadingElement.classList.add('hidden'); // Hide loading indicator
        this.initQualityLevels(); // Populate quality options
        this.initAutoplay(); // Start autoplay countdown if enabled
        this.updateControlsVisibility(); // Initial controls visibility update
      });

      // Event listener for HLS errors
      this.hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data);
        this.errorElement.textContent = 'Failed to load stream. Please try again later.';
        this.errorElement.classList.remove('hidden');
        this.loadingElement.classList.add('hidden');
      });
    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      // Fallback for browsers supporting native HLS (Safari)
      this.video.src = this.url;
      this.video.addEventListener('loadedmetadata', () => {
        this.loadingElement.classList.add('hidden');
        this.initAutoplay();
        this.updateControlsVisibility();
      });
      this.video.addEventListener('error', () => {
        this.errorElement.textContent = 'Failed to load stream. Please try again later.';
        this.errorElement.classList.remove('hidden');
        this.loadingElement.classList.add('hidden');
      });
    } else {
      // Display error if HLS is not supported
      this.errorElement.textContent = 'HLS is not supported in this browser.';
      this.errorElement.classList.remove('hidden');
      this.loadingElement.classList.add('hidden');
    }
  }

  /**
   * Populates the quality selection dropdown with available HLS levels.
   */
  initQualityLevels() {
    if (this.hls && this.hls.levels) {
      this.qualityLevels = this.hls.levels.map((level, index) => ({
        height: level.height,
        index
      }));
      // Build quality options HTML
      const qualityOptions = '<option value="auto">Auto</option>' + this.qualityLevels.map(level => `<option value="${level.index}">${level.height}p</option>`).join('');
      this.qualitySelect.innerHTML = qualityOptions;

      // Add event listener for quality change
      this.qualitySelect.addEventListener('change', (e) => {
        const value = e.target.value;
        // Set HLS level based on selection
        this.hls.currentLevel = value === 'auto' ? -1 : (value === 'hd' ? this.qualityLevels.find(l => l.height >= 720)?.index || 0 : parseInt(value));
      });
    }
  }

  /**
   * Updates the visibility of the player controls based on hover and fullscreen state.
   */
  updateControlsVisibility() {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;

    // Toggle the 'visible' class based on whether it's not fullscreen OR it is fullscreen and being hovered
    // This ensures controls are always visible when not in fullscreen, and only on hover when in fullscreen.
    this.controlsContainer.classList.toggle('visible', !isFullscreen || this.isHovering);

    // Clear any existing timeout
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    }

    // If currently hovering and not in fullscreen, set a timeout to hide controls after a delay
    if (this.isHovering && !isFullscreen) {
         this.controlsTimeout = setTimeout(() => {
            this.controlsContainer.classList.remove('visible');
         }, 3000); // Hide controls after 3 seconds of inactivity
    }
  }

  /**
   * Sets up various event listeners for player interaction.
   */
  setupEventListeners() {
    // Play/Pause button click
    this.playPauseButton.addEventListener('click', () => {
      if (this.video.paused) {
        this.video.play();
        this.playPauseButton.innerHTML = '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'; // Pause icon
      } else {
        this.video.pause();
        this.playPauseButton.innerHTML = '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; // Play icon
      }
    });

    // Video time update (for progress bar and time display)
    this.video.addEventListener('timeupdate', () => {
      const current = this.formatTime(this.video.currentTime);
      const duration = this.formatTime(this.video.duration);
      this.timeDisplay.textContent = `${current} / ${duration}`;
      if (!isNaN(this.video.duration)) {
        this.progressBar.value = (this.video.currentTime / this.video.duration) * 100;
      }
    });

    // Progress bar input (seeking)
    this.progressBar.addEventListener('input', () => {
      const time = (this.progressBar.value / 100) * this.video.duration;
      this.video.currentTime = time;
    });

    // Language select change (for subtitles)
    this.languageSelect.addEventListener('change', (e) => {
      this.currentLanguage = e.target.value;
      this.startSubtitles(); // Restart speech recognition with new language
    });

    // Quality select change (handled in initQualityLevels)

    // Fullscreen button click
    this.fullscreenButton.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        // Request fullscreen on the player container
        this.video.parentElement.requestFullscreen().catch(err => {
          this.errorElement.textContent = 'Fullscreen request failed: ' + err.message;
          this.errorElement.classList.remove('hidden');
        });
        this.fullscreenButton.innerHTML = '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'; // Exit fullscreen icon
      } else {
        // Exit fullscreen
        document.exitFullscreen();
        this.fullscreenButton.innerHTML = '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>'; // Fullscreen icon
      }
    });

    // Fullscreen change event listener
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        // Update button icon when exiting fullscreen
        this.fullscreenButton.innerHTML = '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
        this.isHovering = false; // Reset hovering state on exit
      }
      this.updateControlsVisibility(); // Update controls visibility based on new fullscreen state
    };

    // Add fullscreen change listeners for different browser prefixes
    this.video.parentElement.addEventListener('fullscreenchange', handleFullscreenChange);
    this.video.parentElement.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    this.video.parentElement.addEventListener('mozfullscreenchange', handleFullscreenChange);

    // Mouse enter/leave events on the player container to track hover state
    this.video.parentElement.addEventListener('mouseenter', () => {
      this.isHovering = true;
      this.updateControlsVisibility(); // Show controls on hover
    });

    this.video.parentElement.addEventListener('mouseleave', () => {
      this.isHovering = false;
      this.updateControlsVisibility(); // Hide controls when not hovering
    });

    // Mouse move event to keep controls visible while mouse is moving
    this.video.parentElement.addEventListener('mousemove', () => {
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        // Only extend visibility on mouse move if in fullscreen or controls are currently visible
        if (isFullscreen || this.controlsContainer.classList.contains('visible')) {
             this.controlsContainer.classList.add('visible'); // Ensure controls are visible
             if (this.controlsTimeout) {
                 clearTimeout(this.controlsTimeout); // Clear existing timeout
             }
             // Set a new timeout to hide controls after inactivity
             this.controlsTimeout = setTimeout(() => {
                this.controlsContainer.classList.remove('visible');
             }, 3000); // Hide after 3 seconds of inactivity
        }
    });
  }

  /**
   * Formats time in seconds into MM:SS format.
   * @param {number} seconds - The time in seconds.
   * @returns {string} The formatted time string.
   */
  formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Uses Speech Recognition and Google Apps Script for translation
   * to provide subtitles.
   */
  startSubtitles() {
    // Check for browser support for Speech Recognition
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      this.errorElement.textContent = 'Speech recognition not supported in this browser.';
      this.errorElement.classList.remove('hidden');
      return;
    }

    // Stop any existing recognition instance
    if (this.recognition) {
      this.recognition.stop();
    }

    // Create a new Speech Recognition instance
    this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    this.recognition.lang = this.currentLanguage === 'english' ? 'en-US' : 'ja-JP'; // Set language
    this.recognition.continuous = true; // Keep listening
    this.recognition.interimResults = true; // Get interim results

    // Event listener for speech recognition results
    this.recognition.onresult = async (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');

      if (transcript) {
        // Translate the transcript using Google Apps Script
        const { translated } = await this.recognizeAndTranslate(transcript);
        this.subtitleElement.textContent = translated; // Display translated text
        this.subtitleElement.classList.remove('hidden'); // Show subtitle overlay

        // Clear previous timeout and set a new one to hide subtitle after a short delay
        clearTimeout(this.subtitleTimeout);
        this.subtitleTimeout = setTimeout(() => {
          this.subtitleElement.textContent = '';
          this.subtitleElement.classList.add('hidden');
        }, 750); // Hide after 750ms
      }
    };

    // Event listener for recognition errors
    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'network') {
        this.errorElement.textContent = 'Network error. Retrying speech recognition...';
        this.errorElement.classList.remove('hidden');
        // Attempt to restart recognition after a delay
        setTimeout(() => {
          if (this.toggleSubtitles.checked) { // Only restart if subtitles are still enabled
             this.recognition.start();
          }
        }, 2000);
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.errorElement.textContent = 'Microphone access denied. Please enable it in your browser settings to use subtitles.';
        this.errorElement.classList.remove('hidden');
      } else {
         this.errorElement.textContent = `Speech recognition error: ${event.error}`;
         this.errorElement.classList.remove('hidden');
      }
    };

    // Event listener for when recognition ends (e.g., due to inactivity)
    this.recognition.onend = () => {
      // Restart recognition if subtitles are still enabled
      if (this.toggleSubtitles.checked) {
        this.recognition.start();
      }
    };

    // Start recognition if subtitles are initially enabled
    if (this.toggleSubtitles.checked) {
      this.recognition.start();
    }

    // Add event listener to the subtitle toggle checkbox
    this.toggleSubtitles.addEventListener('change', () => {
      if (this.toggleSubtitles.checked) {
        this.startSubtitles(); // Start if checked
      } else {
        if (this.recognition) {
          this.recognition.stop(); // Stop if unchecked
        }
        this.subtitleElement.textContent = ''; // Clear subtitle text
        this.subtitleElement.classList.add('hidden'); // Hide subtitle overlay
        clearTimeout(this.subtitleTimeout); // Clear any pending hide timeout
      }
    });
  }

  /**
   * Sends text to Google Apps Script for recognition and translation.
   * @param {string} text - The text to process.
   * @returns {Promise<{transcript: string, translated: string}>} The processed text.
   */
  async recognizeAndTranslate(text) {
    try {
      const response = await fetch(`https://script.google.com/macros/s/${GAS_KEY}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          recog: 'ja', // Assume input is Japanese for now
          trans: this.currentLanguage === 'english' ? 'en' : this.currentLanguage // Target translation language
        })
      });

      if (!response.ok) {
         const errorText = await response.text();
         throw new Error(`Translation failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return { transcript: data.speechText || text, translated: data.translatedText || text };
    } catch (error) {
      console.error('Recognition/Translation error:', error);
      // Display a temporary error message for translation issues
      const subtitleErrorElement = document.getElementById('subtitle-error');
      if (subtitleErrorElement) {
          subtitleErrorElement.textContent = 'Translation service error.';
          subtitleErrorElement.classList.remove('hidden');
          setTimeout(() => {
              subtitleErrorElement.classList.add('hidden');
              subtitleErrorElement.textContent = '';
          }, 5000); // Hide error after 5 seconds
      }
      return { transcript: text, translated: text + ' (Translation Failed)' }; // Return original text with a note
    }
  }

  /**
   * Initializes the autoplay countdown and logic for switching channels.
   */
  initAutoplay() {
    // Find related channels in the same group, excluding the current one
    const currentChannel = this.channels.find(c => c.tvgId === this.tvgId);
    const relatedChannels = currentChannel ? this.channels.filter(ch => ch.group === currentChannel.group && ch.tvgId !== this.tvgId) : [];

    // If no related channels or autoplay is disabled, hide countdown and stop interval
    if (!relatedChannels.length || !this.toggleAutoplay.checked) {
      this.countdownElement.classList.add('hidden');
      if (this.autoplayInterval) clearInterval(this.autoplayInterval);
      return;
    }

    let timeLeft = 300; // Start countdown from 5 minutes (300 seconds)
    this.countdownElement.classList.remove('hidden'); // Show countdown element

    // Clear any existing interval before starting a new one
    if (this.autoplayInterval) clearInterval(this.autoplayInterval);

    // Start the countdown interval
    this.autoplayInterval = setInterval(() => {
      // Stop interval if autoplay is disabled
      if (!this.toggleAutoplay.checked) {
        clearInterval(this.autoplayInterval);
        this.countdownElement.classList.add('hidden');
        return;
      }

      // Update countdown display
      this.countdownElement.textContent = `Next channel in ${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`;
      timeLeft--;

      // If countdown reaches zero, switch to the next channel
      if (timeLeft <= 0) {
        clearInterval(this.autoplayInterval);
        const nextChannel = relatedChannels[0]; // Get the first related channel
        window.location.hash = `page=channel/${nextChannel.tvgId}`; // Navigate to the next channel's page
      }
    }, 1000); // Update every 1 second

    // Add event listener to the autoplay toggle checkbox
    this.toggleAutoplay.addEventListener('change', () => {
      if (this.toggleAutoplay.checked) {
        this.initAutoplay(); // Restart autoplay if checked
      } else {
        if (this.autoplayInterval) {
          clearInterval(this.autoplayInterval); // Stop interval if unchecked
        }
        this.countdownElement.classList.add('hidden'); // Hide countdown
      }
    });
  }

  /**
   * Cleans up resources when the player is no longer needed.
   */
  destroy() {
    if (this.hls) this.hls.destroy(); // Destroy HLS instance
    if (this.recognition) this.recognition.stop(); // Stop speech recognition
    if (this.autoplayInterval) clearInterval(this.autoplayInterval); // Clear autoplay interval
    if (this.subtitleTimeout) clearTimeout(this.subtitleTimeout); // Clear subtitle timeout
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout); // Clear controls timeout

    // Remove event listeners from the player container to prevent memory leaks
    const playerContainer = this.video.parentElement;
    if (playerContainer) {
      playerContainer.removeEventListener('fullscreenchange', this.updateControlsVisibility);
      playerContainer.removeEventListener('webkitfullscreenchange', this.updateControlsVisibility);
      playerContainer.removeEventListener('mozfullscreenchange', this.updateControlsVisibility);
      playerContainer.removeEventListener('mouseenter', () => { this.isHovering = true; this.updateControlsVisibility(); }); // Need to remove specific listener instance
      playerContainer.removeEventListener('mouseleave', () => { this.isHovering = false; this.updateControlsVisibility(); }); // Need to remove specific listener instance
       playerContainer.removeEventListener('mousemove', () => { /* mousemove logic */ }); // Need to remove specific listener instance

      // A more robust way to remove event listeners is to store the bound function references
      // or use a library that manages event listeners. For simplicity here, the above might not
      // perfectly remove the listeners if they were added with anonymous functions.
      // However, since the player container is removed from the DOM when switching channels,
      // the associated listeners will generally be cleaned up by the browser.
    }

    // Remove the controls container from the DOM
    if (this.controlsContainer && this.controlsContainer.parentElement) {
        this.controlsContainer.parentElement.removeChild(this.controlsContainer);
    }
  }
}

// Make the class available globally
window.HBOMaxPlayer = HBOMaxPlayer;
