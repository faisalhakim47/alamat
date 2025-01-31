import { District, Province, Regency, RegionData, Village } from './domain.js';
import { Repository } from './repository.js';

type EventListener = (addressCode: string) => void;

interface EventListeners {
    [key: string]: Array<EventListener>;
}

export class ViewBinder {
    static PROVINCE_SELECT_QUERY = '.dwap-province';
    static REGENCY_SELECT_QUERY = '.dwap-regency';
    static DISTRICT_SELECT_QUERY = '.dwap-district';
    static VILLAGE_SELECT_QUERY = '.dwap-village';

    public destroy = () => {};
    private eventListeners: EventListeners = {};
    private setValueQueue: Promise<void> = Promise.resolve();

    constructor(
        private el: HTMLElement,
        private repo: Repository,
        defaultAddressCode: string = '',
        private disabled: boolean = false,
        private readonly: boolean = false,
        private placeholder: string = '-- pilih --',
    ) {
        const handleProvinceChange = () => {
            this.setValue(this.provinceCode);
        };

        const handleRegencyChange = () => {
            this.setValue(this.provinceCode, this.regencyCode);
        };

        const handleDistrictChange = () => {
            this.setValue(
                this.provinceCode,
                this.regencyCode,
                this.districtCode
            );
        };

        const handleVillageChange = () => {
            this.emit('change', this.addressCode);
        };

        this.provinceSelect.addEventListener('change', handleProvinceChange);
        this.regencySelect.addEventListener('change', handleRegencyChange);
        this.districtSelect.addEventListener('change', handleDistrictChange);
        this.villageSelect.addEventListener('change', handleVillageChange);

        this.destroy = () => {
            this.provinceSelect.removeEventListener('change', handleProvinceChange);
            this.regencySelect.removeEventListener('change', handleRegencyChange);
            this.districtSelect.removeEventListener('change', handleDistrictChange);
            this.villageSelect.removeEventListener('change', handleVillageChange);
            this.el = null;
            this.repo = null;
            this.eventListeners = null;
        };

        this.setAddressCode(defaultAddressCode);
    }

    public addEventListener(type: string, listener: EventListener): void {
        const listeners = this.eventListeners[type] || (this.eventListeners[type] = []);
        if (listeners.indexOf(listener) === -1) {
            listeners.push(listener);
        }
    }

    public removeEventListener(type: string, listener: EventListener) {
        this.eventListeners[type] = (this.eventListeners[type] || [])
            .filter((_listener) => {
                return _listener !== listener;
            });
    }

    public get provinceCode() {
        return this.getValueFromSelect(this.provinceSelect);
    }

    public get regencyCode() {
        return this.getValueFromSelect(this.regencySelect);
    }

    public get districtCode() {
        return this.getValueFromSelect(this.districtSelect);
    }

    public get villageCode() {
        return this.getValueFromSelect(this.villageSelect);
    }

    public get addressCode() {
        return this.provinceCode + this.regencyCode + this.districtCode + this.villageCode;
    }

    public setDisabled(disabled: boolean) {
        if (typeof disabled !== 'boolean') return;
        this.disabled = disabled;
        this.applySelectDisabled(this.provinceSelect);
        this.applySelectDisabled(this.regencySelect);
        this.applySelectDisabled(this.districtSelect);
        this.applySelectDisabled(this.villageSelect);
    }

    public setReadonly(readonly: boolean) {
        if (typeof readonly !== 'boolean') return;
        this.readonly = readonly;
        this.applySelectReadonly(this.provinceSelect);
        this.applySelectReadonly(this.regencySelect);
        this.applySelectReadonly(this.districtSelect);
        this.applySelectReadonly(this.villageSelect);
    }

    private applySelectReadonly(select: HTMLSelectElement) {
        Array.from(select.options)
            .forEach((option) => {
                option.disabled = (!option.selected && this.readonly) || option.textContent === this.placeholder;
            });
    }

    private applySelectDisabled(select: HTMLSelectElement) {
        if (this.disabled || this.readonly) {
            select.attributes.setNamedItem(document.createAttribute('disabled'));
        } else {
            select.removeAttribute('disabled');
        }
    }

    public async setValue(provinceId?: string, regencyId?: string, districtId?: string, villageId?: string) {
        this.regencySelect.disabled = true;
        this.districtSelect.disabled = true;
        this.villageSelect.disabled = true;
        return this.setValueQueue = this.setValueQueue
            .then(async () => {
                const [_, emptyRegency, emptyDistrict, emptyVillage] = await Promise.all([
                    this.renderProvinces(provinceId).then(() => false),
                    provinceId
                        ? this.renderRegencies(provinceId, regencyId).then(() => false)
                        : Promise.resolve(true),
                    provinceId && regencyId
                        ? this.renderDistricts(provinceId, regencyId, districtId).then(() => false)
                        : Promise.resolve(true),
                    provinceId && regencyId && districtId
                        ? this.renderVillages(provinceId, regencyId, districtId, villageId).then(() => false)
                        : Promise.resolve(true),
                ]);
                [
                    { isEmpty: emptyRegency, select: this.regencySelect },
                    { isEmpty: emptyDistrict, select: this.districtSelect },
                    { isEmpty: emptyVillage, select: this.villageSelect },
                ].forEach(({ isEmpty, select }) => {
                    if (isEmpty) {
                        this.emptyOptions(select);
                        select.disabled = true;
                    }
                });
                return this.setValueQueue = Promise.resolve();
            })
            .catch(() => {
                return this.setValueQueue = Promise.resolve();
            });
    }

    public async setAddressCode(addressCode: string = '') {
        return this.setValue(
            addressCode.slice(0, 2),
            addressCode.slice(2, 4),
            addressCode.slice(4, 6),
            addressCode.slice(6),
        );
    }

    private emit(type: string, payload: string) {
        (this.eventListeners[type] = this.eventListeners[type] || [])
            .forEach((listener) => {
                return listener(payload);
            });
    }

    private get provinceSelect() {
        return this.el.querySelector(ViewBinder.PROVINCE_SELECT_QUERY) as HTMLSelectElement;
    }

    private get regencySelect() {
        return this.el.querySelector(ViewBinder.REGENCY_SELECT_QUERY) as HTMLSelectElement;
    }

    private get districtSelect() {
        return this.el.querySelector(ViewBinder.DISTRICT_SELECT_QUERY) as HTMLSelectElement;
    }

    private get villageSelect() {
        return this.el.querySelector(ViewBinder.VILLAGE_SELECT_QUERY) as HTMLSelectElement;
    }

    private getValueFromSelect(select: HTMLSelectElement): string|null {
        if (!select) return null;
        const option = select.options.item(select.selectedIndex);
        return option ? option.value : null;
    }

    private emptyOptions(select: HTMLSelectElement) {
        while (select.options.length !== 0) {
            select.options.remove(0);
        }
    }

    private renderOptions(select: HTMLSelectElement, options: Array<RegionData>) {
        this.emptyOptions(select);
        options.forEach((data) => {
            const option = document.createElement('option');
            option.value = data.id;
            option.textContent = data.name;
            select.appendChild(option);
        });
    }

    private setSelected(select: HTMLSelectElement, value: string) {
        if (value) {
            const optionIndex = Array.from(select.options)
                .findIndex((option) => {
                    return option.value === value;
                });
            if (optionIndex === -1) {
                this.renderPlaceholderOption(select);
                select.selectedIndex = 0;
            } else {
                select.selectedIndex = optionIndex;
            }
        } else {
            this.renderPlaceholderOption(select);
            select.selectedIndex = 0;
        }
    }

    private renderPlaceholderOption(select: HTMLSelectElement) {
        const firstOption = select.options.item(0);
        const isPlaceholderExist = firstOption
            ? firstOption.dataset.placeholder === 'placeholder'
            : false;
        if (!isPlaceholderExist) {
            const option = document.createElement('option');
            option.dataset.placeholder = 'placeholder'
            option.disabled = true;
            option.textContent = this.placeholder;
            select.insertAdjacentElement('afterbegin', option);
        }
    }

    private async renderProvinces(provinceId: string) {
        const select = this.provinceSelect;
        select.attributes.setNamedItem(document.createAttribute('disabled'));
        if (select.dataset.rendered !== 'rendered') {
            const options = await this.repo.getProvinces();
            this.renderOptions(select, options);
            select.dataset.rendered = 'rendered';
        }
        this.setSelected(select, provinceId);
        this.applySelectDisabled(select);
        this.applySelectReadonly(select);
    }

    private async renderRegencies(provinceId: string, regencyId: string) {
        const select = this.regencySelect;
        select.attributes.setNamedItem(document.createAttribute('disabled'));
        if (select.dataset.provinceId !== provinceId) {
            const options = await this.repo.getRegencies(provinceId);
            this.renderOptions(select, options);
            select.dataset.provinceId = provinceId;
        }
        this.setSelected(select, regencyId);
        this.applySelectDisabled(select);
        this.applySelectReadonly(select);
    }

    private async renderDistricts(provinceId: string, regencyId: string, districtId: string) {
        const select = this.districtSelect;
        select.attributes.setNamedItem(document.createAttribute('disabled'));
        if (select.dataset.regencyId !== regencyId) {
            const options = await this.repo.getDistricts(provinceId, regencyId);
            this.renderOptions(select, options);
            select.dataset.regencyId = regencyId;
        }
        this.setSelected(select, districtId);
        this.applySelectDisabled(select);
        this.applySelectReadonly(select);
    }

    private async renderVillages(provinceId: string, regencyId: string, districtId: string, villageId: string) {
        const select = this.villageSelect;
        select.attributes.setNamedItem(document.createAttribute('disabled'));
        if (select.dataset.districtId !== districtId) {
            const options = await this.repo.getVillages(provinceId, regencyId, districtId);
            this.renderOptions(select, options);
            select.dataset.districtId = districtId;
        }
        this.setSelected(select, villageId);
        this.applySelectDisabled(select);
        this.applySelectReadonly(select);
    }
}
