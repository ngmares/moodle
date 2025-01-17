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

/**
 * Course index main component.
 *
 * @module     core_courseformat/local/content
 * @class      core_courseformat/local/content
 * @copyright  2020 Ferran Recio <ferran@moodle.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {BaseComponent} from 'core/reactive';
import {getCurrentCourseEditor} from 'core_courseformat/courseeditor';
import inplaceeditable from 'core/inplace_editable';
import Section from 'core_courseformat/local/content/section';
import CmItem from 'core_courseformat/local/content/section/cmitem';
// Course actions is needed for actions that are not migrated to components.
import courseActions from 'core_course/actions';
import DispatchActions from 'core_courseformat/local/content/actions';

export default class Component extends BaseComponent {

    /**
     * Constructor hook.
     */
    create() {
        // Optional component name for debugging.
        this.name = 'course_format';
        // Default query selectors.
        this.selectors = {
            SECTION: `[data-for='section']`,
            SECTION_ITEM: `[data-for='section_title']`,
            SECTION_CMLIST: `[data-for='cmlist']`,
            COURSE_SECTIONLIST: `[data-for='course_sectionlist']`,
            CM: `[data-for='cmitem']`,
            TOGGLER: `[data-action="togglecoursecontentsection"]`,
            COLLAPSE: `[data-toggle="collapse"]`,
            // Formats can override the activity tag but a default one is needed to create new elements.
            ACTIVITYTAG: 'li',
        };
        // Default classes to toggle on refresh.
        this.classes = {
            COLLAPSED: `collapsed`,
            // Course content classes.
            ACTIVITY: `activity`,
            STATEDREADY: `stateready`,
        };
        // Array to save dettached elements during element resorting.
        this.dettachedCms = {};
        this.dettachedSections = {};
        // Index of sections and cms components.
        this.sections = {};
        this.cms = {};
    }

    /**
     * Static method to create a component instance form the mustahce template.
     *
     * @param {string} target the DOM main element or its ID
     * @param {object} selectors optional css selector overrides
     * @return {Component}
     */
    static init(target, selectors) {
        return new Component({
            element: document.getElementById(target),
            reactive: getCurrentCourseEditor(),
            selectors,
        });
    }

    /**
     * Initial state ready method.
     */
    stateReady() {
        this._indexContents();
        // Activate section togglers.
        this.addEventListener(this.element, 'click', this._sectionTogglers);

        if (this.reactive.supportComponents) {
            // Actions are only available in edit mode.
            if (this.reactive.isEditing) {
                new DispatchActions(this);
            }

            // Mark content as state ready.
            this.element.classList.add(this.classes.STATEDREADY);
        }
    }

    /**
     * Setup sections toggler.
     *
     * Toggler click is delegated to the main course content element because new sections can
     * appear at any moment and this way we prevent accidental double bindings.
     *
     * @param {Event} event the triggered event
     */
    _sectionTogglers(event) {
        const sectionlink = event.target.closest(this.selectors.TOGGLER);
        const isChevron = event.target.closest(this.selectors.COLLAPSE);

        if (sectionlink || isChevron) {

            const section = event.target.closest(this.selectors.SECTION);
            const toggler = section.querySelector(this.selectors.COLLAPSE);
            const isCollapsed = toggler?.classList.contains(this.classes.COLLAPSED) ?? false;

            if (isChevron || isCollapsed) {
                // Update the state.
                const sectionId = section.getAttribute('data-id');
                this.reactive.dispatch(
                    'sectionPreferences',
                    [sectionId],
                    {
                        contentexpanded: isCollapsed,
                    },
                );
            }
        }
    }

    /**
     * Return the component watchers.
     *
     * @returns {Array} of watchers
     */
    getWatchers() {
        // Check if the course format is compatible with reactive components.
        if (!this.reactive.supportComponents) {
            return [];
        }
        return [
            // State changes that require to reload some course modules.
            {watch: `cm.visible:updated`, handler: this._reloadCm},
            // Update section number and title.
            {watch: `section.number:updated`, handler: this._refreshSectionNumber},
            // Collapse and expand sections.
            {watch: `section.contentexpanded:updated`, handler: this._refreshSectionCollapsed},
            // Sections and cm sorting.
            {watch: `transaction:start`, handler: this._startProcessing},
            {watch: `course.sectionlist:updated`, handler: this._refreshCourseSectionlist},
            {watch: `section.cmlist:updated`, handler: this._refreshSectionCmlist},
            // Reindex sections and cms.
            {watch: `state:updated`, handler: this._indexContents},
            // State changes thaty require to reload course modules.
            {watch: `cm.visible:updated`, handler: this._reloadCm},
            {watch: `cm.sectionid:updated`, handler: this._reloadCm},
        ];
    }

    /**
     * Reload a course module.
     *
     * Most course module HTML is still strongly backend dependant.
     * Some changes require to get a new version af the module.
     *
     * @param {Object} param
     * @param {Object} param.element update the state update data
     */
    _reloadCm({element}) {
        const cmitem = this.getElement(this.selectors.CM, element.id);
        if (cmitem) {
            courseActions.refreshModule(cmitem, element.id);
        }
    }

    /**
     * Update section collapsed.
     *
     * @param {object} args
     * @param {Object} args.element The element to update
     */
    _refreshSectionCollapsed({element}) {
        const target = this.getElement(this.selectors.SECTION, element.id);
        if (!target) {
            throw new Error(`Unknown section with ID ${element.id}`);
        }
        // Check if it is already done.
        const toggler = target.querySelector(this.selectors.COLLAPSE);
        const isCollapsed = toggler?.classList.contains(this.classes.COLLAPSED) ?? false;

        if (element.contentexpanded === isCollapsed) {
            toggler.click();
        }
    }

    /**
     * Setup the component to start a transaction.
     *
     * Some of the course actions replaces the current DOM element with a new one before updating the
     * course state. This means the component cannot preload any index properly until the transaction starts.
     *
     */
    _startProcessing() {
        // During a section or cm sorting, some elements could be dettached from the DOM and we
        // need to store somewhare in case they are needed later.
        this.dettachedCms = {};
        this.dettachedSections = {};
    }

    /**
     * Update a course section when the section number changes.
     *
     * The courseActions module used for most course section tools still depends on css classes and
     * section numbers (not id). To prevent inconsistencies when a section is moved, we need to refresh
     * the
     *
     * Course formats can override the section title rendering so the frontend depends heavily on backend
     * rendering. Luckily in edit mode we can trigger a title update using the inplace_editable module.
     *
     * @param {Object} param
     * @param {Object} param.element details the update details.
     */
    _refreshSectionNumber({element}) {
        // Find the element.
        const target = this.getElement(this.selectors.SECTION, element.id);
        if (!target) {
            // Job done. Nothing to refresh.
            return;
        }
        // Update section numbers in all data, css and YUI attributes.
        target.id = `section-${element.number}`;
        // YUI uses section number as section id in data-sectionid, in principle if a format use components
        // don't need this sectionid attribute anymore, but we keep the compatibility in case some plugin
        // use it for legacy purposes.
        target.dataset.sectionid = element.number;
        // The data-number is the attribute used by components to store the section number.
        target.dataset.number = element.number;

        // Update title and title inplace editable, if any.
        const inplace = inplaceeditable.getInplaceEditable(target.querySelector(this.selectors.SECTION_ITEM));
        if (inplace) {
            // The course content HTML can be modified at any moment, so the function need to do some checkings
            // to make sure the inplace editable still represents the same itemid.
            const currentvalue = inplace.getValue();
            const currentitemid = inplace.getItemId();
            // Unnamed sections must be recalculated.
            if (inplace.getValue() === '') {
                // The value to send can be an empty value if it is a default name.
                if (currentitemid == element.id && (currentvalue != element.rawtitle || element.rawtitle == '')) {
                    inplace.setValue(element.rawtitle);
                }
            }
        }
    }

    /**
     * Refresh a section cm list.
     *
     * @param {Object} param
     * @param {Object} param.element details the update details.
     */
    _refreshSectionCmlist({element}) {
        const cmlist = element.cmlist ?? [];
        const section = this.getElement(this.selectors.SECTION, element.id);
        const listparent = section?.querySelector(this.selectors.SECTION_CMLIST);
        // A method to create a fake element to be replaced when the item is ready.
        const createCm = this._createCmItem.bind(this);
        if (listparent) {
            this._fixOrder(listparent, cmlist, this.selectors.CM, this.dettachedCms, createCm);
        }
    }

    /**
     * Refresh the section list.
     *
     * @param {Object} param
     * @param {Object} param.element details the update details.
     */
    _refreshCourseSectionlist({element}) {
        const sectionlist = element.sectionlist ?? [];
        const listparent = this.getElement(this.selectors.COURSE_SECTIONLIST);
        // For now section cannot be created at a frontend level.
        const createSection = () => undefined;
        if (listparent) {
            this._fixOrder(listparent, sectionlist, this.selectors.SECTION, this.dettachedSections, createSection);
        }
    }

    /**
     * Regenerate content indexes.
     *
     * This method is used when a legacy action refresh some content element.
     */
    _indexContents() {
        // Find unindexed sections.
        this._scanIndex(
            this.selectors.SECTION,
            this.sections,
            (item) => {
                return new Section(item);
            }
        );

        // Find unindexed cms.
        this._scanIndex(
            this.selectors.CM,
            this.cms,
            (item) => {
                return new CmItem(item);
            }
        );
    }

    /**
     * Reindex a content (section or cm) of the course content.
     *
     * This method is used internally by _indexContents.
     *
     * @param {string} selector the DOM selector to scan
     * @param {*} index the index attribute to update
     * @param {*} creationhandler method to create a new indexed element
     */
    _scanIndex(selector, index, creationhandler) {
        const items = this.getElements(`${selector}:not([data-indexed])`);
        items.forEach((item) => {
            if (!item?.dataset?.id) {
                return;
            }
            // Delete previous item component.
            if (index[item.dataset.id] !== undefined) {
                index[item.dataset.id].unregister();
            }
            // Create the new component.
            index[item.dataset.id] = creationhandler({
                ...this,
                element: item,
            });
            // Mark as indexed.
            item.dataset.indexed = true;
        });
    }

    /**
     * Reload a course module contents.
     *
     * Most course module HTML is still strongly backend dependant.
     * Some changes require to get a new version of the module.
     *
     * @param {object} param0 the watcher details
     * @param {object} param0.element the state object
     */
    _reloadCm({element}) {
        const cmitem = this.getElement(this.selectors.CM, element.id);
        if (cmitem) {
            const promise = courseActions.refreshModule(cmitem, element.id);
            promise.then(() => {
                this._indexContents();
                return;
            }).catch();
        }
    }

    /**
     * Create a new course module item in a section.
     *
     * Thos method will append a fake item in the container and trigger an ajax request to
     * replace the fake element by the real content.
     *
     * @param {Element} container the container element (section)
     * @param {Number} cmid the course-module ID
     * @returns {Element} the created element
     */
    _createCmItem(container, cmid) {
        const newItem = document.createElement(this.selectors.ACTIVITYTAG);
        newItem.dataset.for = 'cmitem';
        newItem.dataset.id = cmid;
        // The legacy actions.js requires a specific ID and class to refresh the CM.
        newItem.id = `module-${cmid}`;
        newItem.classList.add(this.classes.ACTIVITY);
        container.append(newItem);
        this._reloadCm({
            element: this.reactive.get('cm', cmid),
        });
        return newItem;
    }

    /**
     * Fix/reorder the section or cms order.
     *
     * @param {Element} container the HTML element to reorder.
     * @param {Array} neworder an array with the ids order
     * @param {string} selector the element selector
     * @param {Object} dettachedelements a list of dettached elements
     * @param {function} createMethod method to create missing elements
     */
    async _fixOrder(container, neworder, selector, dettachedelements, createMethod) {
        if (container === undefined) {
            return;
        }

        // Empty lists should not be visible.
        if (!neworder.length) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        // Grant the list is visible (in case it was empty).
        container.classList.remove('hidden');

        // Move the elements in order at the beginning of the list.
        neworder.forEach((itemid, index) => {
            let item = this.getElement(selector, itemid) ?? dettachedelements[itemid] ?? createMethod(container, itemid);
            if (item === undefined) {
                // Missing elements cannot be sorted.
                return;
            }
            // Get the current elemnt at that position.
            const currentitem = container.children[index];
            if (currentitem === undefined) {
                container.append(item);
                return;
            }
            if (currentitem !== item) {
                container.insertBefore(item, currentitem);
            }
        });

        // Dndupload add a fake element we need to keep.
        let dndFakeActivity;

        // Remove the remaining elements.
        while (container.children.length > neworder.length) {
            const lastchild = container.lastChild;
            if (lastchild?.classList?.contains('dndupload-preview')) {
                dndFakeActivity = lastchild;
            } else {
                dettachedelements[lastchild?.dataset?.id ?? 0] = lastchild;
            }
            container.removeChild(lastchild);
        }
        // Restore dndupload fake element.
        if (dndFakeActivity) {
            container.append(dndFakeActivity);
        }
    }
}
