// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

import {Reactive} from 'core/reactive';
import notification from 'core/notification';
import Exporter from 'core_courseformat/local/courseeditor/exporter';
import log from 'core/log';
import ajax from 'core/ajax';
import * as Storage from 'core/sessionstorage';

/**
 * Main course editor module.
 *
 * All formats can register new components on this object to create new reactive
 * UI components that watch the current course state.
 *
 * @module     core_courseformat/local/courseeditor/courseeditor
 * @class     core_courseformat/local/courseeditor/courseeditor
 * @copyright  2021 Ferran Recio <ferran@moodle.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
export default class extends Reactive {

    /**
     * The current state cache key
     *
     * The state cache is considered dirty if the state changes from the last page or
     * if the page has editing mode on.
     *
     * @attribute stateKey
     * @type number|null
     * @default 1
     * @package
     */
    stateKey = 1;

    /**
     * Set up the course editor when the page is ready.
     *
     * The course can only be loaded once per instance. Otherwise an error is thrown.
     *
     * @param {number} courseId course id
     */
    async loadCourse(courseId) {

        if (this.courseId) {
            throw new Error(`Cannot load ${courseId}, course already loaded with id ${this.courseId}`);
        }

        // Default view format setup.
        this._editing = false;
        this._supportscomponents = false;

        this.courseId = courseId;

        let stateData;

        try {
            stateData = await this.getServerCourseState();
        } catch (error) {
            log.error("EXCEPTION RAISED WHILE INIT COURSE EDITOR");
            log.error(error);
            return;
        }

        this.setInitialState(stateData);

        // In editing mode, the session cache is considered dirty always.
        if (this.isEditing) {
            this.stateKey = null;
        } else {
            // Check if the last state is the same as the cached one.
            const newState = JSON.stringify(stateData);
            const previousState = Storage.get(`course/${courseId}/staticState`);
            if (previousState !== newState) {
                Storage.set(`course/${courseId}/staticState`, newState);
                Storage.set(`course/${courseId}/stateKey`, Date.now());
            }
            this.stateKey = Storage.get(`course/${courseId}/stateKey`);
        }
    }

    /**
     * Setup the current view settings
     *
     * @param {Object} setup format, page and course settings
     * @param {boolean} setup.editing if the page is in edit mode
     * @param {boolean} setup.supportscomponents if the format supports components for content
     */
    setViewFormat(setup) {
        this._editing = setup.editing ?? false;
        this._supportscomponents = setup.supportscomponents ?? false;
    }

    /**
     * Load the current course state from the server.
     *
     * @returns {Object} the current course state
     */
    async getServerCourseState() {
        const courseState = await ajax.call([{
            methodname: 'core_courseformat_get_state',
            args: {
                courseid: this.courseId,
            }
        }])[0];

        const stateData = JSON.parse(courseState);

        return {
            course: {},
            section: [],
            cm: [],
            ...stateData,
        };
    }

    /**
     * Return the current edit mode.
     *
     * Components should use this method to check if edit mode is active.
     *
     * @return {boolean} if edit is enabled
     */
    get isEditing() {
        return this._editing ?? false;
    }

    /**
     * Return a data exporter to transform state part into mustache contexts.
     *
     * @return {Exporter} the exporter class
     */
    getExporter() {
        return new Exporter(this);
    }

    /**
     * Return if the current course support components to refresh the content.
     *
     * @returns {boolean} if the current content support components
     */
    get supportComponents() {
        return this._supportscomponents ?? false;
    }

    /**
     * Get a value from the course editor static storage if any.
     *
     * The course editor static storage uses the sessionStorage to store values from the
     * components. This is used to prevent unnecesary template loadings on every page. However,
     * the storage does not work if no sessionStorage can be used (in debug mode for example),
     * if the page is in editing mode or if the initial state change from the last page.
     *
     * @param {string} key the key to get
     * @return {boolean|string} the storage value or false if cannot be loaded
     */
    getStorageValue(key) {
        if (this.isEditing || !this.stateKey) {
            return false;
        }
        const dataJson = Storage.get(`course/${this.courseId}/${key}`);
        if (!dataJson) {
            return false;
        }
        // Check the stateKey.
        try {
            const data = JSON.parse(dataJson);
            if (data?.stateKey !== this.stateKey) {
                return false;
            }
            return data.value;
        } catch (error) {
            return false;
        }
    }

    /**
     * Stores a value into the course editor static storage if available
     *
     * @param {String} key the key to store
     * @param {*} value the value to store (must be compatible with JSON,stringify)
     * @returns {boolean} true if the value is stored
     */
    setStorageValue(key, value) {
        // Values cannot be stored on edit mode.
        if (this.isEditing) {
            return false;
        }
        const data = {
            stateKey: this.stateKey,
            value,
        };
        return Storage.set(`course/${this.courseId}/${key}`, JSON.stringify(data));
    }

    /**
     * Dispatch a change in the state.
     *
     * Usually reactive modules throw an error directly to the components when something
     * goes wrong. However, course editor can directly display a notification.
     *
     * @method dispatch
     * @param {mixed} args any number of params the mutation needs.
     */
    async dispatch(...args) {
        try {
            await super.dispatch(...args);
        } catch (error) {
            // Display error modal.
            notification.exception(error);
            // Force unlock all elements.
            super.dispatch('unlockAll');
        }
    }
}
